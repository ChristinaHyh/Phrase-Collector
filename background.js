importScripts('shared/default-prompts.js', 'shared/i18n.js', 'shared/core.js');
const tr = PC.t;

// =============================================================================
// 安装 / 徽标
// =============================================================================
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const res = await chrome.storage.local.get(PC.STORAGE_KEY);
  if (!res[PC.STORAGE_KEY]) await PC.saveConfig(PC.defaultConfig());
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

async function updateBadge(tabId, url) {
  try {
    const cfg = await PC.loadConfig();
    const on = PC.isSiteActive(cfg, url);
    await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: PC.THEMES[PC.themeOf(cfg)].badge });
  } catch {
    // 标签页可能已关闭
  }
}

async function updateActiveBadge() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id != null) updateBadge(tab.id, tab.url);
}

// 工具栏图标跟随主题
async function applyThemeIcon() {
  const { png } = PC.THEMES[PC.themeOf(await PC.loadConfig())];
  await chrome.action.setIcon({ path: Object.fromEntries([16, 32, 48].map((s) => [s, `icons/${png}${s}.png`])) });
}
applyThemeIcon().catch(() => {});

chrome.tabs.onActivated.addListener(updateActiveBadge);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') updateBadge(tabId, tab.url);
});
chrome.storage.onChanged.addListener((changes) => {
  if (!changes[PC.STORAGE_KEY]) return;
  updateActiveBadge();
  if (changes[PC.STORAGE_KEY].oldValue?.general?.theme !== changes[PC.STORAGE_KEY].newValue?.general?.theme) {
    applyThemeIcon();
    restyleManagedModels().catch(() => {}); // Anki 未打开时忽略，下次制卡时会再同步
  }
});

// =============================================================================
// AI 调用（流式）
// =============================================================================
function buildPrompts(cfg, action, ctx) {
  const vars = { ...ctx, targetLanguage: cfg.general.targetLanguage };
  const aiFields = action.outputSchema.filter((f) => f.name && (f.fill || 'ai') === 'ai');
  const keys = aiFields.map((f) => `- "${f.name}" (string): ${f.description || ''}`).join('\n');
  const system =
    PC.renderTemplate(action.systemPrompt, vars, { escape: false }) +
    `\n\n## Output Format\nRespond with ONLY one valid JSON object — no markdown code fences, no text before or after it. ` +
    `The JSON object must contain exactly these string keys, in this order:\n${keys}\n` +
    `Use "\\n" for line breaks inside values. If a field is not applicable, use an empty string.`;
  const user = PC.renderTemplate(action.prompt, vars, { escape: false });
  return { system, user };
}

function joinUrl(base, path) {
  return String(base || '').replace(/\/+$/, '') + path;
}

function openaiEndpoint(base) {
  const b = String(base || '').replace(/\/+$/, '');
  return /\/chat\/completions$/.test(b) ? b : b + '/chat/completions';
}

async function httpError(res) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j.error?.message || j.error?.msg || j.message || (typeof j.error === 'string' ? j.error : '') || text;
    } catch {
      detail = text;
    }
  } catch {
    // 忽略
  }
  detail = String(detail).slice(0, 300);
  const hint =
    {
      400: tr('请求参数有误（若提示 response_format，请在 AI 服务里关闭“JSON 模式”）'),
      401: tr('API Key 无效或未填写'),
      402: tr('账户余额不足'),
      403: tr('无访问权限'),
      404: tr('接口地址或模型名称不存在'),
      429: tr('请求过于频繁或额度不足'),
    }[res.status] || tr('请求失败');
  return new Error(tr('{hint}（HTTP {status}）', { hint, status: res.status }) + (detail ? tr('：') + detail : ''));
}

async function* sseEvents(res, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    if (signal?.aborted) return;
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
  if (buf.startsWith('data:')) yield buf.slice(5).trim();
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function streamAI(provider, system, user, { signal, onText, onThinking } = {}) {
  if (!provider) throw new Error(tr('未找到该动作使用的 AI 服务，请在设置中检查'));
  if (!provider.apiKey && !/localhost|127\.0\.0\.1/.test(provider.baseURL || '')) {
    throw new Error(tr('AI 服务「{name}」未填写 API Key，请在设置 → AI 服务中填写', { name: provider.name }));
  }
  if (!provider.model) throw new Error(tr('AI 服务「{name}」未填写模型名称', { name: provider.name }));
  const temperature = provider.temperature === '' || provider.temperature == null ? undefined : Number(provider.temperature);
  let full = '';
  const emit = (t) => {
    if (!t) return;
    full += t;
    onText?.(t);
  };

  let res;
  if (provider.type === 'anthropic') {
    res = await fetch(joinUrl(provider.baseURL || 'https://api.anthropic.com', '/v1/messages'), {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
        stream: true,
        ...(temperature != null && !Number.isNaN(temperature) ? { temperature } : {}),
      }),
    });
    if (!res.ok) throw await httpError(res);
    for await (const data of sseEvents(res, signal)) {
      const j = safeJson(data);
      if (!j) continue;
      if (j.type === 'content_block_delta') {
        if (j.delta?.type === 'text_delta') emit(j.delta.text);
        else if (j.delta?.type === 'thinking_delta') onThinking?.(j.delta.thinking);
      } else if (j.type === 'error') throw new Error(j.error?.message || tr('Anthropic 返回错误'));
    }
    return full;
  }

  if (provider.type === 'gemini') {
    const url = joinUrl(provider.baseURL || 'https://generativelanguage.googleapis.com', `/v1beta/models/${encodeURIComponent(provider.model)}:streamGenerateContent?alt=sse`);
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          ...(temperature != null && !Number.isNaN(temperature) ? { temperature } : {}),
          ...(provider.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (!res.ok) throw await httpError(res);
    for await (const data of sseEvents(res, signal)) {
      const j = safeJson(data);
      if (!j) continue;
      if (j.error) throw new Error(j.error.message || tr('Gemini 返回错误'));
      for (const part of j.candidates?.[0]?.content?.parts || []) {
        if (part.thought) onThinking?.(part.text || '');
        else emit(part.text);
      }
    }
    return full;
  }

  // OpenAI 兼容
  res = await fetch(openaiEndpoint(provider.baseURL), {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: true,
      ...(temperature != null && !Number.isNaN(temperature) ? { temperature } : {}),
      ...(provider.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw await httpError(res);
  for await (const data of sseEvents(res, signal)) {
    if (data === '[DONE]') break;
    const j = safeJson(data);
    if (!j) continue;
    if (j.error) throw new Error(j.error.message || tr('AI 服务返回错误'));
    const delta = j.choices?.[0]?.delta || {};
    const thinking = delta.reasoning_content || delta.reasoning;
    if (thinking) onThinking?.(thinking);
    emit(delta.content);
  }
  return full;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pc-ai') return;
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== 'run') return; // ping 消息仅用于保持 Service Worker 存活
    try {
      const cfg = await PC.loadConfig();
      const action = cfg.actions.find((a) => a.id === msg.actionId);
      if (!action) throw new Error(tr('划词动作不存在'));
      const provider = cfg.providers.find((p) => p.id === action.providerId) || cfg.providers[0];
      const { system, user } = buildPrompts(cfg, action, msg.context);
      const text = await streamAI(provider, system, user, {
        signal: controller.signal,
        onText: (t) => port.postMessage({ type: 'delta', text: t }),
        onThinking: () => port.postMessage({ type: 'thinking' }),
      });
      port.postMessage({ type: 'done', text });
    } catch (e) {
      if (controller.signal.aborted) return;
      port.postMessage({ type: 'error', message: e?.message || String(e) });
    }
  });
});

// =============================================================================
// AnkiConnect
// =============================================================================
let ankiPermissionGranted = false;
const syncedModels = new Map(); // modelName -> 已同步模板的签名

async function ankiRaw(cfg, action, params = {}, timeout = 15000) {
  const body = { action, version: 6, params };
  if (cfg.anki.apiKey) body.key = cfg.anki.apiKey;
  let res;
  try {
    res = await fetch(cfg.anki.url || 'http://127.0.0.1:8765', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(tr('AnkiConnect 响应超时。如果 Anki 弹出了授权窗口，请点击“Yes”后重试'));
    throw new Error(tr('无法连接 AnkiConnect（{url}）。请确认 Anki 已打开，并已安装 AnkiConnect 插件（代码 2055492159）', { url: cfg.anki.url }));
  }
  if (res.status === 403) throw new Error(tr('AnkiConnect 拒绝了请求（403）。请在设置 → Anki 中点击“测试连接”并在 Anki 弹窗中允许'));
  if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`);
  const j = await res.json();
  if (j && typeof j === 'object' && 'error' in j) {
    if (j.error) {
      const t = translateAnkiError(j.error);
      throw t instanceof Error ? t : new Error(t);
    }
    return j.result;
  }
  return j;
}

function translateAnkiError(err) {
  const s = String(err);
  if (/duplicate/i.test(s)) return Object.assign(new Error(tr('卡片已存在（同一牌组中首字段重复）')), { duplicate: true });
  if (/empty/i.test(s)) return tr('首字段为空，无法创建卡片');
  if (/deck was not found/i.test(s)) return tr('牌组不存在');
  if (/model was not found/i.test(s)) return tr('笔记类型不存在');
  if (/valid api key/i.test(s)) return tr('AnkiConnect API Key 不正确');
  return s;
}

async function anki(cfg, action, params) {
  if (!ankiPermissionGranted) {
    const r = await ankiRaw(cfg, 'requestPermission', {}, 60000);
    if (r?.permission !== 'granted') throw new Error(tr('AnkiConnect 拒绝了本插件的访问，请在 Anki 弹窗中选择允许'));
    ankiPermissionGranted = true;
  }
  return ankiRaw(cfg, action, params);
}

function ttsTag(cfg, field) {
  const a = cfg.anki;
  let opts = a.ttsLang || 'en_US';
  if (a.ttsVoices?.trim()) opts += ` voices=${a.ttsVoices.trim().replace(/\s+/g, '')}`;
  const speed = Number(a.ttsSpeed);
  if (speed && speed !== 1) opts += ` speed=${speed}`;
  return `{{tts ${opts}:${field}}}`;
}

function resolveTts(cfg, action, tpl) {
  const field = action.anki.ttsField;
  let tag = '';
  if (field && cfg.anki.ttsMode === 'anki') tag = ttsTag(cfg, field);
  else if (field && cfg.anki.ttsMode === 'audio') tag = `{{#Audio}}{{Audio}}{{/Audio}}{{^Audio}}${ttsTag(cfg, field)}{{/Audio}}`;
  return tpl.replaceAll('[[TTS]]', tag);
}

function managedTemplates(cfg, action) {
  const auto = PC.autoAnkiTemplates(action);
  const a = action.anki;
  return {
    front: resolveTts(cfg, action, a.front?.trim() ? a.front : auto.front),
    back: resolveTts(cfg, action, a.back?.trim() ? a.back : auto.back),
    // 主题配色变量拼在最前面，自定义 CSS 也可以用 var(--pc-*)
    css: PC.ankiThemeCss(PC.themeOf(cfg)) + (a.css?.trim() ? a.css : auto.css),
  };
}

// Anki 模板中的特殊变量，不是笔记字段
const ANKI_SPECIAL_FIELDS = new Set(['FrontSide', 'Card', 'CardFlag', 'Deck', 'Subdeck', 'Tags', 'Type', 'CardID']);

// 模板中引用的全部字段名：{{Field}}、{{#Field}}、{{^Field}}、{{tts en_US:Field}} 等
function templateFieldRefs(...templates) {
  const names = [];
  for (const tpl of templates) {
    for (const [, inner] of String(tpl || '').matchAll(/\{\{([^{}]+)\}\}/g)) {
      if (/^\s*[/!]/.test(inner)) continue;
      const name = inner.replace(/^\s*[#^]/, '').split(':').pop().trim();
      if (name && !ANKI_SPECIAL_FIELDS.has(name)) names.push(name);
    }
  }
  return names;
}

// 笔记类型字段 = 输出字段 + Audio + 模板中引用到的其它字段。
// 模板引用了不存在的字段时 Anki 会拒绝整个笔记类型（例如删除了 SourceTitle 输出字段但模板仍在使用）。
function managedFields(action, templates) {
  const names = action.outputSchema.map((f) => f.name).filter(Boolean);
  const refs = templates ? templateFieldRefs(templates.front, templates.back) : [];
  return [...new Set([...names, 'Audio', ...refs])];
}

async function ensureManagedModel(cfg, action) {
  const modelName = action.anki.modelName?.trim();
  if (!modelName) throw new Error(tr('请在设置中填写笔记类型名称'));
  const t = managedTemplates(cfg, action);
  const fields = managedFields(action, t);
  const signature = JSON.stringify([fields, t]);
  if (syncedModels.get(modelName) === signature) return modelName;

  const models = await anki(cfg, 'modelNames');
  if (!models.includes(modelName)) {
    await anki(cfg, 'createModel', {
      modelName,
      inOrderFields: fields,
      css: t.css,
      isCloze: false,
      cardTemplates: [{ Name: 'Card 1', Front: t.front, Back: t.back }],
    });
  } else {
    const existing = await anki(cfg, 'modelFieldNames', { modelName });
    for (const f of fields) {
      if (!existing.includes(f)) {
        try {
          await anki(cfg, 'modelFieldAdd', { modelName, fieldName: f, index: existing.length });
          existing.push(f);
        } catch (e) {
          throw new Error(tr('笔记类型「{model}」缺少字段 {field}，且无法自动添加（{error}）。请升级 AnkiConnect 或在 Anki 中手动添加', { model: modelName, field: f, error: e.message }));
        }
      }
    }
    const templates = await anki(cfg, 'modelTemplates', { modelName });
    const [name, cur] = Object.entries(templates)[0] || ['Card 1', {}];
    if (cur.Front !== t.front || cur.Back !== t.back) {
      await anki(cfg, 'updateModelTemplates', { model: { name: modelName, templates: { [name]: { Front: t.front, Back: t.back } } } });
    }
    const styling = await anki(cfg, 'modelStyling', { modelName });
    if (styling?.css !== t.css) await anki(cfg, 'updateModelStyling', { model: { name: modelName, css: t.css } });
  }
  syncedModels.set(modelName, signature);
  return modelName;
}

// 切换主题后，把 Anki 中已存在的托管笔记类型换成新配色（已有卡片一起变色，不新建笔记类型）
async function restyleManagedModels() {
  const cfg = await PC.loadConfig();
  const models = await anki(cfg, 'modelNames');
  for (const a of cfg.actions) {
    const name = a.anki.modelName?.trim();
    if (a.anki.modelMode === 'existing' || !models.includes(name)) continue;
    await anki(cfg, 'updateModelStyling', { model: { name, css: managedTemplates(cfg, a).css } });
    syncedModels.delete(name);
  }
}

function formatField(value) {
  const s = PC.valueToString(value).trim();
  if (/^https?:\/\/\S+$/.test(s)) return `<a href="${PC.escapeHtml(s)}">${PC.escapeHtml(s)}</a>`;
  return PC.lightMarkdown(PC.escapeHtml(s)).replace(/\r?\n/g, '<br>');
}

function highlight(html, term) {
  const t = PC.escapeHtml(String(term || '').trim());
  if (t.length < 2) return null;
  const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let found = false;
  // 只替换标签之外的文本，避免破坏 <br>、<a> 等
  const out = html
    .split(/(<[^>]+>)/)
    .map((seg) =>
      seg.startsWith('<')
        ? seg
        : seg.replace(re, (m) => {
            found = true;
            return `<span class="pc-hl">${m}</span>`;
          })
    )
    .join('');
  return found ? out : null;
}

function audioUrl(source, text) {
  const q = encodeURIComponent(text);
  if (source === 'youdao-uk') return `https://dict.youdao.com/dictvoice?audio=${q}&type=1`;
  if (source === 'google') return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${q}`;
  return `https://dict.youdao.com/dictvoice?audio=${q}&type=2`;
}

async function storeAudio(cfg, text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 600) return '';
  const source = cfg.anki.audioSource;
  if (source === 'google' && clean.length > 200) return '';
  try {
    const res = await fetch(audioUrl(source, clean), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return '';
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 500) return '';
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(source + '|' + clean))))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
    const filename = await anki(cfg, 'storeMediaFile', { filename: `pc_${hash}.mp3`, data: btoa(bin) });
    return `[sound:${filename || `pc_${hash}.mp3`}]`;
  } catch {
    return ''; // 在线发音失败时模板会回退到 Anki TTS
  }
}

async function addNote({ actionId, values, context, deck, allowDuplicate }) {
  const cfg = await PC.loadConfig();
  const action = cfg.actions.find((a) => a.id === actionId);
  if (!action) throw new Error(tr('划词动作不存在'));
  const a = action.anki;
  const deckName = (deck || a.deck || '').trim() || 'Default';

  const formatted = {};
  for (const [k, v] of Object.entries({ ...context, ...values })) formatted[k] = formatField(v);
  if (a.highlightField && formatted[a.highlightField]) {
    formatted[a.highlightField] =
      highlight(formatted[a.highlightField], values[a.highlightTerm]) ??
      highlight(formatted[a.highlightField], context?.selection) ??
      formatted[a.highlightField];
  }
  // 模板里用到但输出字段中没有的来源信息，用真实网页数据补上
  formatted.SourceTitle ??= formatted.webTitle;
  formatted.SourceURL ??= formatted.webUrl;
  formatted.Audio = '';
  if (cfg.anki.ttsMode === 'audio' && a.ttsField) formatted.Audio = await storeAudio(cfg, values[a.ttsField]);

  let modelName;
  let fields = {};
  if (a.modelMode === 'existing') {
    modelName = a.modelName?.trim();
    if (!modelName) throw new Error(tr('请在设置中选择要使用的 Anki 笔记类型'));
    const map = a.fieldMap || {};
    for (const [field, tpl] of Object.entries(map)) {
      if (tpl) fields[field] = PC.renderTemplate(tpl, formatted, { escape: false });
    }
    if (!Object.keys(fields).length) throw new Error(tr('请在设置中为笔记类型配置字段映射'));
  } else {
    modelName = await ensureManagedModel(cfg, action);
    for (const f of managedFields(action, managedTemplates(cfg, action))) fields[f] = formatted[f] || '';
  }

  await anki(cfg, 'createDeck', { deck: deckName });
  const noteId = await anki(cfg, 'addNote', {
    note: {
      deckName,
      modelName,
      fields,
      tags: String(a.tags || '')
        .split(/[\s,，]+/)
        .filter(Boolean),
      options: { allowDuplicate: !!(allowDuplicate ?? a.allowDuplicate), duplicateScope: 'deck' },
    },
  });
  return { noteId, deckName, modelName };
}

async function setActionDeck(actionId, deck) {
  const cfg = await PC.loadConfig();
  const action = cfg.actions.find((a) => a.id === actionId);
  if (!action || !deck?.trim()) return;
  action.anki.deck = deck.trim();
  await PC.saveConfig(cfg);
}

async function setActionDuplicate(actionId, allow) {
  const cfg = await PC.loadConfig();
  const action = cfg.actions.find((a) => a.id === actionId);
  if (!action) return;
  action.anki.allowDuplicate = !!allow;
  await PC.saveConfig(cfg);
}

async function testProvider(provider) {
  let thinking = false;
  const text = await streamAI(
    provider,
    'You are a connectivity test. Respond with ONLY a JSON object.',
    'Return exactly this JSON object: {"ok": "yes"}',
    { signal: AbortSignal.timeout(60000), onThinking: () => (thinking = true) }
  );
  const parsed = PC.parsePartialJson(text);
  return { reply: text.slice(0, 200), json: !!parsed && Object.keys(parsed).length > 0, thinking };
}

async function listModels(provider) {
  if (provider.type === 'anthropic') {
    const res = await fetch(joinUrl(provider.baseURL || 'https://api.anthropic.com', '/v1/models?limit=100'), {
      headers: { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    });
    if (!res.ok) throw await httpError(res);
    return (await res.json()).data.map((m) => m.id);
  }
  if (provider.type === 'gemini') {
    const res = await fetch(joinUrl(provider.baseURL || 'https://generativelanguage.googleapis.com', '/v1beta/models?pageSize=200'), {
      headers: { 'x-goog-api-key': provider.apiKey },
    });
    if (!res.ok) throw await httpError(res);
    return (await res.json()).models.map((m) => m.name.replace(/^models\//, ''));
  }
  const base = String(provider.baseURL || '').replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const res = await fetch(base + '/models', { headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {} });
  if (!res.ok) throw await httpError(res);
  const j = await res.json();
  return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
}

const handlers = {
  'anki:add': (m) => addNote(m),
  'anki:decks': async () => (await anki(await PC.loadConfig(), 'deckNames')).sort((a, b) => a.localeCompare(b)),
  'anki:models': async () => (await anki(await PC.loadConfig(), 'modelNames')).sort((a, b) => a.localeCompare(b)),
  'anki:fields': async (m) => anki(await PC.loadConfig(), 'modelFieldNames', { modelName: m.modelName }),
  'anki:version': async () => anki(await PC.loadConfig(), 'version'),
  'anki:browse':async (m) => anki(await PC.loadConfig(), 'guiBrowse', { query: `nid:${m.noteId}` }),
  'anki:test': async () => {
    const cfg = await PC.loadConfig();
    ankiPermissionGranted = false;
    const perm = await ankiRaw(cfg, 'requestPermission', {}, 60000);
    if (perm?.permission !== 'granted') throw new Error(tr('AnkiConnect 拒绝了本插件的访问，请在 Anki 弹窗中选择允许'));
    ankiPermissionGranted = true;
    const version = await ankiRaw(cfg, 'version');
    return { version, requireApiKey: !!perm.requireApikey };
  },
  'anki:sync': async () => {
    const cfg = await PC.loadConfig();
    syncedModels.clear();
    const done = [];
    for (const a of cfg.actions) if (a.anki.modelMode !== 'existing') done.push(await ensureManagedModel(cfg, a));
    return done;
  },
  'action:setDeck': (m) => setActionDeck(m.actionId, m.deck),
  'action:setDuplicate': (m) => setActionDuplicate(m.actionId, m.allow),
  'ai:test': (m) => testProvider(m.provider),
  'ai:models': (m) => listModels(m.provider),
  'open:options': () => chrome.runtime.openOptionsPage(),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  Promise.resolve()
    .then(() => fn(msg))
    .then(
      (data) => sendResponse({ ok: true, data }),
      (e) => sendResponse({ ok: false, error: e?.message || String(e), duplicate: !!e?.duplicate })
    );
  return true;
});
