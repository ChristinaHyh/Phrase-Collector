// Phrase Collector 共享核心：默认配置、模板引擎、宽松 JSON 解析、白名单匹配等。
// 在 background / content / options / popup 中都会加载，挂在 globalThis.PC 上。
(() => {
  const P = globalThis.PC_PROMPTS;
  const STORAGE_KEY = 'pc_config';
  const CONFIG_VERSION = 1;

  // ---------------------------------------------------------------------------
  // Anki 托管笔记模板。[[TTS]] 会在同步到 Anki 时替换为发音标签（见 background.js）。
  // ---------------------------------------------------------------------------
  // 颜色全部用 --pc-* 变量，由 ankiThemeCss() 按主题注入（同步笔记类型时拼在最前面）
  const ANKI_CSS = String.raw`/* 颜色变量 --pc-* 由插件按当前主题自动注入 */
.card{font-family:-apple-system,"Segoe UI",Arial,"PingFang SC","Microsoft YaHei",sans-serif;font-size:19px;line-height:1.65;text-align:left;color:var(--pc-fg);background:var(--pc-bg);}
.pc-card{max-width:720px;margin:0 auto;padding:18px 20px;}
.pc-hero{text-align:center;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--pc-hero);font-weight:700;margin:4px 0 14px;}
.pc-main{font-size:28px;font-weight:650;line-height:1.35;color:var(--pc-main);text-align:center;margin:8px 0 6px;}
.pc-main.pc-sentence{font-size:23px;text-align:left;line-height:1.55;}
.pc-audio{text-align:center;margin:4px 0 10px;}
.pc-context{font-size:18px;color:var(--pc-context-fg);background:var(--pc-context-bg);border-radius:10px;padding:12px 14px;margin:12px 0;}
.pc-hl{color:var(--pc-hl);font-weight:700;border-bottom:2px solid var(--pc-hl-line);}
.pc-prompt{text-align:center;color:var(--pc-prompt);font-size:13px;margin-top:14px;}
.pc-answer .pc-prompt{display:none;}
.pc-meaning{font-size:16.5px;line-height:1.7;color:var(--pc-meaning-fg);background:var(--pc-meaning-bg);border-radius:12px;padding:11px 15px;margin:14px 0;}
.pc-section{border-top:1px solid var(--pc-line);padding:11px 0;}
.pc-label{font-size:12px;color:var(--pc-label);font-weight:750;letter-spacing:.06em;margin-bottom:4px;}
.pc-value{font-size:17px;overflow-wrap:anywhere;}
.pc-fold>summary{display:flex;align-items:center;gap:7px;margin:0;cursor:pointer;list-style:none;user-select:none;-webkit-user-select:none;}
.pc-fold>summary::-webkit-details-marker{display:none;}
.pc-fold>summary::before{content:"";width:5px;height:5px;margin:0 2px 0 1px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .2s;}
.pc-fold[open]>summary{margin-bottom:6px;}
.pc-fold[open]>summary::before{transform:rotate(45deg);}
.pc-source{border-top:1px solid var(--pc-line);padding-top:10px;margin-top:6px;font-size:12px;color:var(--pc-source);overflow-wrap:anywhere;}
.pc-source a{color:var(--pc-link);}
hr#answer{border:none;border-top:1px dashed var(--pc-hr);margin:16px 0;}`;

  // 卡片配色，与插件主题一致：dusk 暮光紫、lagoon 湖光绿
  const ANKI_THEMES = {
    dusk: {
      light: { bg: '#fbfafc', fg: '#2a2f42', hero: '#8a87ad', main: '#2f3354', 'context-fg': '#4c5066', 'context-bg': '#f2f1f6', hl: '#5b5796', 'hl-line': '#cdc4e6', prompt: '#9092a5', 'meaning-fg': '#2f3450', 'meaning-bg': '#eeecf6', line: '#e6e4ed', label: '#68709a', source: '#8b8ea3', link: '#5d6a8f', hr: '#d8d5e3' },
      dark: { bg: '#1b1c26', fg: '#e5e5ef', main: '#e7e5fa', 'context-fg': '#cbcbdc', 'context-bg': '#262735', hl: '#bcb5f2', 'hl-line': '#5a558f', 'meaning-fg': '#ebe9f8', 'meaning-bg': '#2d2c44', line: '#393a4c', label: '#b0aee0', link: '#b4b9e6' },
    },
    lagoon: {
      light: { bg: '#fafbf9', fg: '#22313a', hero: '#6f948b', main: '#173a30', 'context-fg': '#45555c', 'context-bg': '#f0f3f1', hl: '#0f7a5c', 'hl-line': '#9fd8c4', prompt: '#8a9894', 'meaning-fg': '#1f3d35', 'meaning-bg': '#e6f2ec', line: '#e0e7e3', label: '#577e71', source: '#7d968f', link: '#2f8468', hr: '#cfdad5' },
      dark: { bg: '#171f20', fg: '#e4ecec', main: '#dff4ea', 'context-fg': '#c5d2d0', 'context-bg': '#232d2e', hl: '#7fe0bd', 'hl-line': '#3c7a64', 'meaning-fg': '#e5f3ec', 'meaning-bg': '#22392f', line: '#364644', label: '#92c6b1', link: '#93d6bb' },
    },
  };

  function ankiThemeCss(theme) {
    const t = ANKI_THEMES[theme] || ANKI_THEMES.dusk;
    const vars = (o) => Object.entries(o).map(([k, v]) => `--pc-${k}:${v};`).join('');
    return `.card{${vars(t.light)}}\n.card.nightMode,.card.night_mode,.nightMode .card,.night_mode .card{${vars(t.dark)}}\n`;
  }

  const section = (field, label) =>
    `{{#${field}}}<div class="pc-section"><div class="pc-label">${label}</div><div class="pc-value">{{${field}}}</div></div>{{/${field}}}`;
  // 默认折叠的分区，点标题展开
  const foldSection = (field, label) =>
    `{{#${field}}}<details class="pc-section pc-fold"><summary class="pc-label">${label}</summary><div class="pc-value">{{${field}}}</div></details>{{/${field}}}`;

  const PHRASE_FRONT = `<div class="pc-card">
<div class="pc-hero">Phrase in Context</div>
<div class="pc-main">{{Expression}}</div>
<div class="pc-audio">[[TTS]]</div>
{{#ContextEN}}<div class="pc-context">{{ContextEN}}</div>{{/ContextEN}}
<div class="pc-prompt">回想它在这句话里的意思</div>
</div>`;

  const PHRASE_BACK = `<div class="pc-answer">{{FrontSide}}</div>
<div class="pc-card">
<hr id="answer">
<div class="pc-meaning">{{MeaningZH}}</div>
${section('ContextZH', '原句译文 · Context')}
${foldSection('NuanceZH', '语感 · Nuance')}
${foldSection('PatternEN', '可迁移表达 · Pattern')}
{{#SourceURL}}<div class="pc-source">{{#SourceTitle}}{{SourceTitle}}<br>{{/SourceTitle}}{{SourceURL}}</div>{{/SourceURL}}
</div>`;

  const SENTENCE_FRONT = `<div class="pc-card">
<div class="pc-hero">Sentence Decode</div>
<div class="pc-main pc-sentence">{{SentenceEN}}</div>
<div class="pc-audio">[[TTS]]</div>
<div class="pc-prompt">先尝试理解整句，再翻面检查结构与逻辑</div>
</div>`;

  const SENTENCE_BACK = `<div class="pc-answer">{{FrontSide}}</div>
<div class="pc-card">
<hr id="answer">
<div class="pc-meaning">{{SentenceZH}}</div>
${section('Core', '句子主干 · Core')}
${section('Chunks', '意群划分 · Chunks')}
${section('LogicZH', '逻辑关系 · Logic')}
${section('HardPartZH', '阅读难点 · Hard Part')}
${section('Takeaways', '迁移表达 · Takeaways')}
{{#SourceURL}}<div class="pc-source">{{SourceURL}}</div>{{/SourceURL}}
</div>`;

  // 没有自定义模板的动作，按输出字段自动生成一套正反面
  function autoAnkiTemplates(action) {
    const fields = action.outputSchema.map((f) => f.name).filter(Boolean);
    const first = fields[0] || 'Front';
    const front = `<div class="pc-card">
<div class="pc-hero">${escapeHtml(action.name)}</div>
<div class="pc-main">{{${first}}}</div>
<div class="pc-audio">[[TTS]]</div>
</div>`;
    const back = `<div class="pc-answer">{{FrontSide}}</div>
<div class="pc-card">
<hr id="answer">
${fields.slice(1).map((f) => section(f, f)).join('\n')}
</div>`;
    return { front, back, css: ANKI_CSS };
  }

  function schema(fields, fills = {}) {
    return fields.map(([name, description]) => ({
      id: uid(),
      name,
      description: fills[name] ? '' : description,
      fill: fills[name] || 'ai',
    }));
  }

  function defaultActions() {
    return [
      {
        id: 'phrase-in-context',
        builtin: 'phrase',
        name: P.phrase.name,
        icon: '💬',
        enabled: true,
        providerId: 'deepseek-default',
        shortcut: P.phrase.shortcut,
        systemPrompt: P.phrase.systemPrompt,
        prompt: P.phrase.prompt,
        outputSchema: schema(P.phrase.fields, { SourceTitle: 'webTitle', SourceURL: 'webUrl' }),
        layout: P.phrase.layout,
        autoAddToAnki: false,
        anki: {
          deck: 'Phrase Collector::Phrases',
          modelMode: 'managed',
          modelName: 'Phrase Collector · Phrase',
          front: PHRASE_FRONT,
          back: PHRASE_BACK,
          css: ANKI_CSS,
          fieldMap: {},
          tags: 'PhraseCollector Phrase',
          ttsField: 'Expression',
          highlightField: 'ContextEN',
          highlightTerm: 'Expression',
          allowDuplicate: false,
        },
      },
      {
        id: 'sentence-decode',
        builtin: 'sentence',
        name: P.sentence.name,
        icon: '🧩',
        enabled: true,
        providerId: 'deepseek-default',
        shortcut: P.sentence.shortcut,
        systemPrompt: P.sentence.systemPrompt,
        prompt: P.sentence.prompt,
        outputSchema: schema(P.sentence.fields, { SourceURL: 'webUrl' }),
        layout: P.sentence.layout,
        autoAddToAnki: false,
        anki: {
          deck: 'Phrase Collector::Sentences',
          modelMode: 'managed',
          modelName: 'Phrase Collector · Sentence',
          front: SENTENCE_FRONT,
          back: SENTENCE_BACK,
          css: ANKI_CSS,
          fieldMap: {},
          tags: 'PhraseCollector Sentence',
          ttsField: 'SentenceEN',
          highlightField: '',
          highlightTerm: '',
          allowDuplicate: false,
        },
      },
    ];
  }

  function newAction() {
    return {
      id: uid(),
      name: '新动作',
      icon: '✨',
      enabled: true,
      providerId: 'deepseek-default',
      shortcut: '',
      systemPrompt: '你是一位英语学习助手。',
      prompt: 'Selection:\n{{selection}}\n\nContext:\n{{paragraphs}}\n\nExplain the selection in {{targetLanguage}}.',
      outputSchema: [
        { id: uid(), name: 'Front', description: '选中的英文表达', fill: 'ai' },
        { id: uid(), name: 'Back', description: '中文解释', fill: 'ai' },
      ],
      layout: '',
      autoAddToAnki: false,
      anki: {
        deck: 'Phrase Collector',
        modelMode: 'managed',
        modelName: 'Phrase Collector · ' + uid().slice(0, 4),
        front: '',
        back: '',
        css: '',
        fieldMap: {},
        tags: 'PhraseCollector',
        ttsField: 'Front',
        highlightField: '',
        highlightTerm: '',
        allowDuplicate: false,
      },
    };
  }

  const PROVIDER_PRESETS = [
    { key: 'deepseek', name: 'DeepSeek', type: 'openai', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
    { key: 'openai', name: 'OpenAI', type: 'openai', baseURL: 'https://api.openai.com/v1', model: '' },
    { key: 'openrouter', name: 'OpenRouter', type: 'openai', baseURL: 'https://openrouter.ai/api/v1', model: '' },
    { key: 'siliconflow', name: '硅基流动 SiliconFlow', type: 'openai', baseURL: 'https://api.siliconflow.cn/v1', model: '' },
    { key: 'moonshot', name: 'Kimi (Moonshot)', type: 'openai', baseURL: 'https://api.moonshot.cn/v1', model: '' },
    { key: 'dashscope', name: '通义千问 (DashScope)', type: 'openai', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '' },
    { key: 'zhipu', name: '智谱 GLM', type: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: '' },
    { key: 'ark', name: '火山方舟 (豆包)', type: 'openai', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
    { key: 'ollama', name: 'Ollama (本地)', type: 'openai', baseURL: 'http://localhost:11434/v1', model: '' },
    { key: 'anthropic', name: 'Anthropic Claude', type: 'anthropic', baseURL: 'https://api.anthropic.com', model: 'claude-haiku-5-5' },
    { key: 'gemini', name: 'Google Gemini', type: 'gemini', baseURL: 'https://generativelanguage.googleapis.com', model: '' },
    { key: 'custom', name: '自定义 (OpenAI 兼容)', type: 'openai', baseURL: '', model: '' },
  ];

  function defaultConfig() {
    return {
      version: CONFIG_VERSION,
      general: {
        enabled: true,
        theme: 'dusk', // dusk：暮光（Weekly Hub 配色）；lagoon：湖光（Finance Butler 配色）
        siteMode: 'whitelist', // whitelist：仅白名单网站；all：所有网站
        whitelist: [],
        toolbarTrigger: 'auto', // auto：划词后显示工具栏；shortcut：仅快捷键
        toolbarStyle: 'standard', // standard：图标 + 名称 + 快捷键；lite：只显示图标
        cacheResults: true, // 同一页面再次划选同一内容时直接显示上次结果
        targetLanguage: '简体中文',
        maxContextChars: 2000,
        uiLanguage: defaultUiLanguage(), // zh：中文界面；en：English
      },
      providers: [
        {
          id: 'deepseek-default',
          name: 'DeepSeek',
          type: 'openai',
          baseURL: 'https://api.deepseek.com',
          apiKey: '',
          model: 'deepseek-chat',
          temperature: 0.3,
          jsonMode: true,
        },
      ],
      actions: defaultActions(),
      anki: {
        url: 'http://127.0.0.1:8765',
        apiKey: '',
        ttsMode: 'anki', // anki：Anki 内置 TTS；audio：下载在线发音（失败时回退 TTS）；off
        ttsLang: 'en_US',
        ttsVoices: '',
        ttsSpeed: 1,
        audioSource: 'youdao-us',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 存储
  // ---------------------------------------------------------------------------
  function normalizeConfig(stored) {
    const def = defaultConfig();
    if (!stored || typeof stored !== 'object') {
      setLang(def.general.uiLanguage);
      return def;
    }
    const cfg = {
      ...def,
      ...stored,
      general: { ...def.general, ...(stored.general || {}) },
      anki: { ...def.anki, ...(stored.anki || {}) },
      providers: Array.isArray(stored.providers) ? stored.providers : def.providers,
      actions: Array.isArray(stored.actions) ? stored.actions : def.actions,
    };
    const blankAnki = newAction().anki;
    cfg.actions = cfg.actions.map((a) => upgradeAnkiTemplates({
      ...newAction(),
      ...a,
      outputSchema: Array.isArray(a.outputSchema) ? a.outputSchema : [],
      anki: { ...blankAnki, ...(a.anki || {}) },
    }));
    cfg.version = CONFIG_VERSION;
    setLang(cfg.general.uiLanguage);
    return cfg;
  }

  // 旧版默认模板的指纹：内置动作仍是未改动过的旧默认模板时，升级到新模板；用户自己改过的不动
  const LEGACY_TEMPLATES = {
    css: ['1p3eu36b374'],
    back: { phrase: ['24owkj520sz'] },
  };

  function upgradeAnkiTemplates(action) {
    const def = action.builtin && builtinDefaults(action.builtin);
    if (!def) return action;
    const a = action.anki;
    if (LEGACY_TEMPLATES.css.includes(hashString(a.css || ''))) a.css = def.anki.css;
    if (LEGACY_TEMPLATES.back[action.builtin]?.includes(hashString(a.back || ''))) a.back = def.anki.back;
    return action;
  }

  async function loadConfig() {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeConfig(res[STORAGE_KEY]);
  }

  async function saveConfig(cfg) {
    await chrome.storage.local.set({ [STORAGE_KEY]: cfg });
  }

  function builtinDefaults(builtin) {
    return defaultActions().find((a) => a.builtin === builtin);
  }

  // ---------------------------------------------------------------------------
  // 工具函数
  // ---------------------------------------------------------------------------
  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // 转义后再做少量 Markdown：**粗体**、`代码`
  function lightMarkdown(escaped) {
    return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  function valueToString(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(valueToString).join('\n');
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  }

  // ---------------------------------------------------------------------------
  // 迷你 Liquid 模板：{{ var | filter }}、{% if a %}、{% if a and b %}、{% unless %}、{% else %}
  // escape=true 时变量值会做 HTML 转义（用于面板渲染）。
  // ---------------------------------------------------------------------------
  const FILTERS = {
    newline_to_br: (s) => s.replace(/\r?\n/g, '<br>'),
    strip: (s) => s.trim(),
    upcase: (s) => s.toUpperCase(),
    downcase: (s) => s.toLowerCase(),
    escape: (s) => s,
    raw: (s) => s,
  };

  function compileTemplate(tpl) {
    const re = /\{%-?\s*([\s\S]+?)\s*-?%\}|\{\{\s*([\s\S]+?)\s*\}\}/g;
    const root = { children: [] };
    const stack = [root];
    let last = 0;
    let m;
    const cur = () => stack[stack.length - 1];
    const push = (n) => (cur().inElse ? cur().elseChildren : cur().children).push(n);
    while ((m = re.exec(tpl))) {
      if (m.index > last) push({ t: 'text', v: tpl.slice(last, m.index) });
      last = re.lastIndex;
      if (m[2] != null) {
        const [name, ...filters] = m[2].split('|').map((s) => s.trim());
        push({ t: 'var', name, filters });
        continue;
      }
      const tag = m[1].trim();
      const [kw, ...rest] = tag.split(/\s+/);
      if (kw === 'if' || kw === 'unless') {
        const node = { t: 'if', negate: kw === 'unless', cond: rest.join(' '), children: [], elseChildren: [], inElse: false };
        push(node);
        stack.push(node);
      } else if (kw === 'else') {
        if (stack.length > 1) cur().inElse = true;
      } else if (kw === 'endif' || kw === 'endunless') {
        if (stack.length > 1) stack.pop();
      }
      // 其它标签忽略
    }
    if (last < tpl.length) push({ t: 'text', v: tpl.slice(last) });
    return root;
  }

  function evalCond(cond, data) {
    const truthy = (name) => {
      const v = data[name];
      return v != null && valueToString(v).trim() !== '';
    };
    return cond.split(/\s+or\s+/).some((part) => part.split(/\s+and\s+/).every((n) => truthy(n.trim())));
  }

  function renderNodes(nodes, data, escape) {
    let out = '';
    for (const n of nodes) {
      if (n.t === 'text') out += n.v;
      else if (n.t === 'var') {
        let s = valueToString(data[n.name]);
        if (escape && !n.filters.includes('raw')) s = lightMarkdown(escapeHtml(s)).replace(/\r?\n/g, '<br>');
        for (const f of n.filters) if (FILTERS[f]) s = FILTERS[f](s);
        out += s;
      } else if (n.t === 'if') {
        const ok = evalCond(n.cond, data) !== n.negate;
        out += renderNodes(ok ? n.children : n.elseChildren, data, escape);
      }
    }
    return out;
  }

  function renderTemplate(tpl, data, { escape = true } = {}) {
    return renderNodes(compileTemplate(tpl || '').children, data || {}, escape);
  }

  // ---------------------------------------------------------------------------
  // 宽松 JSON 解析：支持流式输出中途截断、代码块包裹、<think> 前缀、字符串中的裸换行
  // ---------------------------------------------------------------------------
  function stripThinking(text) {
    let t = String(text || '');
    t = t.replace(/<think>[\s\S]*?<\/think>/g, '');
    if (/^\s*<think>/.test(t)) return ''; // 思考尚未结束
    return t;
  }

  function parsePartialJson(text) {
    const s = stripThinking(text);
    let i = s.indexOf('{');
    if (i < 0) return null;
    const ws = () => {
      while (i < s.length && /\s/.test(s[i])) i++;
    };
    const str = () => {
      i++;
      let out = '';
      while (i < s.length) {
        const c = s[i++];
        if (c === '"') return { v: out, done: true };
        if (c === '\\') {
          if (i >= s.length) break;
          const e = s[i++];
          if (e === 'n') out += '\n';
          else if (e === 't') out += '\t';
          else if (e === 'r') out += '\r';
          else if (e === 'b') out += '\b';
          else if (e === 'f') out += '\f';
          else if (e === 'u') {
            const h = s.substr(i, 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) {
              i = s.length;
              break;
            }
            out += String.fromCharCode(parseInt(h, 16));
            i += 4;
          } else out += e;
        } else out += c;
      }
      return { v: out, done: false };
    };
    const val = () => {
      ws();
      if (i >= s.length) return undefined;
      const c = s[i];
      if (c === '"') return str().v;
      if (c === '{') return obj();
      if (c === '[') return arr();
      const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i, i + 40));
      if (m) {
        i += m[0].length;
        return JSON.parse(m[0]);
      }
      i = s.length;
      return undefined;
    };
    const obj = () => {
      i++;
      const o = {};
      for (;;) {
        ws();
        if (i >= s.length) return o;
        if (s[i] === '}') {
          i++;
          return o;
        }
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] !== '"') {
          i = s.length;
          return o;
        }
        const k = str();
        if (!k.done) return o;
        ws();
        if (s[i] !== ':') return o;
        i++;
        const v = val();
        if (v !== undefined) o[k.v] = v;
      }
    };
    const arr = () => {
      i++;
      const a = [];
      for (;;) {
        ws();
        if (i >= s.length) return a;
        if (s[i] === ']') {
          i++;
          return a;
        }
        if (s[i] === ',') {
          i++;
          continue;
        }
        const v = val();
        if (v === undefined) return a;
        a.push(v);
      }
    };
    return obj();
  }

  // ---------------------------------------------------------------------------
  // 白名单匹配
  //   example.com        匹配该域名及其子域名
  //   *.example.com      同上
  //   https://x.com/*    通配符匹配完整 URL（可省略协议）
  //   /regex/            正则匹配完整 URL
  // ---------------------------------------------------------------------------
  function patternMatches(pattern, url) {
    const p = pattern.trim();
    if (!p || p.startsWith('#')) return false;
    let u;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    if (p.length > 2 && p.startsWith('/') && p.endsWith('/')) {
      try {
        return new RegExp(p.slice(1, -1)).test(url);
      } catch {
        return false;
      }
    }
    const isHostOnly = !p.includes('/') && !/^[a-z]+:/i.test(p);
    if (isHostOnly) {
      const host = p.replace(/^\*\./, '').replace(/:\d+$/, '').toLowerCase();
      if (host.includes('*')) return globToRegex(host).test(u.hostname);
      return u.hostname === host || u.hostname.endsWith('.' + host);
    }
    const target = /^[a-z]+:\/\//i.test(p) ? url : url.replace(/^[a-z]+:\/\//i, '');
    return globToRegex(p).test(target);
  }

  function globToRegex(glob) {
    return new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  }

  // 网址 → 通用域名白名单：https://www.nytimes.com/2026/... → *.nytimes.com
  // 不认识的内容返回 null；IP 与 localhost 原样返回主机名
  const MULTI_LEVEL_SUFFIX = /^(com|net|org|gov|edu|ac|co|or|ne|go|mil)\.[a-z]{2}$/;
  function sitePatternFromUrl(text) {
    const s = String(text || '').trim();
    if (!s || s.includes('*') || /\s/.test(s)) return null;
    let u;
    try {
      u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || /^\d+(\.\d+){3}$/.test(host) || host.startsWith('[')) return host || null;
    const parts = host.split('.');
    const keep = parts.length > 2 && MULTI_LEVEL_SUFFIX.test(parts.slice(-2).join('.')) ? 3 : 2;
    return '*.' + parts.slice(-keep).join('.');
  }

  // ---------------------------------------------------------------------------
  // 动作图标：emoji / 文本、svg:名称（内置线条图标）、data:image/…（自定义图片）
  // ---------------------------------------------------------------------------
  const ICON_LIBRARY = {
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'message-text': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
    quote: '<path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.5-1.5 4-4 5"/><path d="M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.5-1.5 4-4 5"/>',
    highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8M7 12h10M7 16h6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    blocks: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    feather: '<path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  };
  const EMOJI_LIBRARY = ['💬', '🧩', '📖', '📝', '🔍', '💡', '✨', '🎯', '🌐', '🗣️', '🧠', '📌', '🔤', '📚', '🪄', '⭐', '🎧', '✏️', '🌱', '🍀', '🔖', '🧭', '🪶', '☕'];

  // 渲染动作图标为 DOM 节点（仅在页面环境中调用）
  function iconNode(icon) {
    const v = String(icon || '').trim() || '✨';
    if (v.startsWith('svg:') && ICON_LIBRARY[v.slice(4)]) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 'pc-icon pc-icon-svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.9');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = ICON_LIBRARY[v.slice(4)];
      return svg;
    }
    if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(v)) {
      const img = document.createElement('img');
      img.className = 'pc-icon pc-icon-img';
      img.alt = '';
      img.src = v;
      return img;
    }
    const span = document.createElement('span');
    span.className = 'pc-icon pc-icon-text';
    const text = v.startsWith('svg:') ? '✨' : v;
    // 按字形截取（避免把 🗣️、👨‍💻 这类组合 emoji 截断），最多 2 个
    const graphemes = globalThis.Intl?.Segmenter ? [...new Intl.Segmenter().segment(text)].map((g) => g.segment) : [...text];
    span.textContent = graphemes.slice(0, 2).join('');
    return span;
  }

  // 字符串哈希（cyrb53），用于结果缓存键
  function hashString(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // ---------------------------------------------------------------------------
  // 划词结果缓存：同一页面 + 同一动作（含提示词与模型）+ 同一选区与段落 → 上次结果
  // ---------------------------------------------------------------------------
  const CACHE_KEY = 'pc_cache';
  const CACHE_MAX = 300;

  function cacheKeyFor(cfg, action, context) {
    let page = context.webUrl;
    try {
      const u = new URL(context.webUrl);
      page = u.origin + u.pathname + u.search;
    } catch {}
    const provider = cfg.providers.find((p) => p.id === action.providerId) || cfg.providers[0];
    const signature = JSON.stringify([action.systemPrompt, action.prompt, action.outputSchema.map((f) => [f.name, f.description, f.fill]), provider?.model, cfg.general.targetLanguage]);
    return hashString([page, action.id, signature, context.selection, context.paragraphs].join('\u0001'));
  }

  async function cacheGet(key) {
    const all = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
    return all[key] || null;
  }

  async function cachePut(key, patch) {
    const all = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
    all[key] = { ...all[key], ...patch, time: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => all[a].time - all[b].time).slice(0, keys.length - CACHE_MAX).forEach((k) => delete all[k]);
    }
    await chrome.storage.local.set({ [CACHE_KEY]: all });
  }

  async function cacheStats() {
    const all = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
    return { count: Object.keys(all).length, bytes: JSON.stringify(all).length };
  }

  async function cacheClear() {
    await chrome.storage.local.remove(CACHE_KEY);
  }

  // ---------------------------------------------------------------------------
  // 界面语言：中文原文即翻译键，英文对照在 shared/i18n.js（PC_I18N_EN）
  // ---------------------------------------------------------------------------
  const UI_LANGUAGES = [
    ['zh', '中文'],
    ['en', 'English'],
  ];
  let uiLang = 'zh';

  function defaultUiLanguage() {
    return /^zh/i.test(globalThis.navigator?.language || 'zh') ? 'zh' : 'en';
  }

  function setLang(lang) {
    uiLang = lang === 'en' ? 'en' : 'zh';
  }

  // t('已添加到「{deck}」', { deck })：先查译文，再替换 {name} 占位符
  function t(text, vars) {
    let out = uiLang === 'en' ? (globalThis.PC_I18N_EN?.[text] ?? text) : text;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  // 静态 HTML：data-i18n 写中文原文，按当前语言替换文字 / title
  function localize(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    document.documentElement.lang = uiLang === 'en' ? 'en' : 'zh-CN';
  }

  // 目标语言的常用选项（也可以直接输入其它语言）
  const TARGET_LANGUAGES = ['简体中文', '繁體中文', 'English', '日本語', '한국어', 'Français', 'Deutsch', 'Español', 'Português', 'Italiano', 'Русский', 'Tiếng Việt', 'ไทย', 'Bahasa Indonesia', 'العربية'];

  const THEMES = {
    dusk: { name: '暮光 Dusk', badge: '#68769b', icon: 'icon.svg', png: '' },
    lagoon: { name: '湖光 Lagoon', badge: '#608b77', icon: 'icon-lagoon.svg', png: 'lagoon-' },
  };
  const themeOf = (cfg) => (THEMES[cfg?.general?.theme] ? cfg.general.theme : 'dusk');

  function isSiteActive(cfg, url) {
    if (!cfg.general.enabled) return false;
    if (!/^(https?|file):/i.test(url || '')) return false;
    if (cfg.general.siteMode === 'all') return true;
    return (cfg.general.whitelist || []).some((p) => patternMatches(p, url));
  }

  // ---------------------------------------------------------------------------
  // 快捷键
  // ---------------------------------------------------------------------------
  function keyFromEvent(e) {
    if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
    if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
    if (/^F\d{1,2}$/.test(e.code)) return e.code;
    const k = e.key;
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return '';
    return k.length === 1 ? k.toUpperCase() : k;
  }

  function comboFromEvent(e) {
    const key = keyFromEvent(e);
    if (!key) return '';
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    parts.push(key);
    return parts.join('+');
  }

  function normalizeCombo(s) {
    const parts = String(s || '')
      .split('+')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return '';
    const key = parts.pop();
    const mods = parts.map((m) => ({ control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta', command: 'Meta' })[m.toLowerCase()] || m);
    const order = ['Ctrl', 'Alt', 'Shift', 'Meta'];
    return [...order.filter((o) => mods.includes(o)), key.length === 1 ? key.toUpperCase() : key].join('+');
  }

  globalThis.PC = {
    ICON_LIBRARY,
    EMOJI_LIBRARY,
    iconNode,
    hashString,
    cacheKeyFor,
    cacheGet,
    cachePut,
    cacheStats,
    cacheClear,
    STORAGE_KEY,
    ANKI_CSS,
    ankiThemeCss,
    UI_LANGUAGES,
    TARGET_LANGUAGES,
    setLang,
    lang: () => uiLang,
    t,
    localize,
    PROVIDER_PRESETS,
    defaultConfig,
    defaultActions,
    builtinDefaults,
    newAction,
    autoAnkiTemplates,
    normalizeConfig,
    loadConfig,
    saveConfig,
    uid,
    escapeHtml,
    lightMarkdown,
    valueToString,
    renderTemplate,
    parsePartialJson,
    stripThinking,
    patternMatches,
    sitePatternFromUrl,
    THEMES,
    themeOf,
    isSiteActive,
    comboFromEvent,
    normalizeCombo,
  };
})();
