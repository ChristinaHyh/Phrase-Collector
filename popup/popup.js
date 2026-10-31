const $ = (id) => document.getElementById(id);
const tr = PC.t;
let cfg;
let tab;
let missing = []; // 当前网页还没授权的匹配模式
let denied = false; // 刚才的授权请求被拒绝

function hostPatternsFor(url) {
  // 白名单中直接匹配当前网址的条目
  return cfg.general.whitelist.filter((p) => PC.patternMatches(p, url));
}

function setCheck(id, cls, html) {
  const el = $(id);
  el.className = 'check ' + cls;
  el.querySelector('.text').innerHTML = html;
  el.querySelectorAll('a[data-options]').forEach((a) => a.addEventListener('click', () => chrome.runtime.openOptionsPage()));
}

// 当前网页生效需要的授权：所有网站模式要 *://*/*，否则是匹配这个网址的白名单规则对应的网站
function originsForTab() {
  if (cfg.general.siteMode === 'all') return [PC.ALL_SITES];
  return [...new Set(hostPatternsFor(tab?.url || '').flatMap(PC.originPatternsForRule))];
}

async function refresh() {
  missing = PC.isSiteActive(cfg, tab?.url || '') ? await PC.ungrantedOrigins(originsForTab()) : [];
  render();
}

// 必须在点击事件中直接调用（浏览器要求用户手势）。弹窗可能在授权提示出现时关闭，后续由后台完成脚本注册
async function requestOrigins(origins) {
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

function render() {
  PC.localize();
  const theme = PC.themeOf(cfg);
  document.documentElement.dataset.theme = theme;
  document.querySelector('header img').src = '../icons/' + PC.THEMES[theme].icon;
  $('enabled').checked = cfg.general.enabled;
  const url = tab?.url || '';
  let host = '';
  try {
    const u = new URL(url);
    host = /^https?:$/.test(u.protocol) ? u.hostname : '';
  } catch {}
  $('host').textContent = host || tr('此页面不支持划词');
  const btn = $('toggleSite');
  const state = $('state');
  const on = PC.isSiteActive(cfg, url);
  state.className = 'state' + (on ? ' on' : '');
  btn.style.display = '';
  btn.disabled = false;
  if (!host) {
    state.textContent = tr('浏览器内置页面、扩展商店等无法注入脚本');
    btn.style.display = 'none';
  } else if (!cfg.general.enabled) {
    state.textContent = tr('插件已停用');
    btn.style.display = 'none';
  } else if (cfg.general.siteMode === 'all') {
    if (missing.length) {
      state.textContent = denied ? tr('未获得授权，划词不会生效') : tr('“所有网站”模式需要授权访问所有网站');
      state.className = 'state';
      btn.textContent = tr('授权所有网站');
      btn.className = 'primary';
    } else {
      state.textContent = tr('当前为“所有网站”模式，已生效');
      btn.style.display = 'none';
    }
  } else if (on && missing.length) {
    state.textContent = denied ? tr('未获得授权，划词不会生效') : tr('已在白名单中，但还没有授权访问此网站');
    state.className = 'state';
    btn.textContent = tr('授权此网站');
    btn.className = 'primary';
  } else if (on) {
    state.textContent = tr('✓ 已在白名单中，划词生效');
    btn.textContent = tr('移出白名单');
    btn.className = '';
  } else {
    state.textContent = tr('不在白名单中，划词不生效');
    btn.textContent = tr('将 {site} 加入白名单', { site: PC.sitePatternFromUrl(url) || host });
    btn.className = 'primary';
  }

  const missingKey = cfg.actions
    .filter((a) => a.enabled)
    .map((a) => cfg.providers.find((p) => p.id === a.providerId))
    .filter((p) => p && !p.apiKey && !/localhost|127\.0\.0\.1/.test(p.baseURL));
  if (missingKey.length) setCheck('aiCheck', 'err', tr('{name} 未填写 API Key · <a data-options>去设置</a>', { name: PC.escapeHtml(missingKey[0].name) }));
  else {
    const names = [...new Set(cfg.actions.filter((a) => a.enabled).map((a) => cfg.providers.find((p) => p.id === a.providerId)?.model).filter(Boolean))];
    setCheck('aiCheck', 'ok', tr('AI：{models}', { models: PC.escapeHtml(names.join(tr('、')) || tr('已配置')) }));
  }

  const list = $('actions');
  list.replaceChildren();
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = tr('ACTIONS · 选中文字后点击按钮或按快捷键');
  list.append(title);
  for (const a of cfg.actions.filter((x) => x.enabled)) {
    const item = document.createElement('div');
    item.className = 'item';
    const name = document.createElement('span');
    name.className = 'act';
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.append(PC.iconNode(a.icon));
    name.append(ic, a.name);
    item.append(name);
    if (a.shortcut) {
      const kbd = document.createElement('kbd');
      kbd.textContent = a.shortcut;
      item.append(kbd);
    }
    list.append(item);
  }
}

async function checkAnki() {
  setCheck('ankiCheck', '', tr('Anki：检测中…'));
  chrome.runtime.sendMessage({ type: 'anki:version' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      setCheck('ankiCheck', 'warn', tr('Anki 未连接 · <a data-options>查看说明</a>'));
      $('ankiCheck').title = res?.error || '';
    } else setCheck('ankiCheck', 'ok', tr('Anki 已连接（AnkiConnect v{version}）', { version: res.data }));
  });
}

$('enabled').addEventListener('change', async () => {
  cfg.general.enabled = $('enabled').checked;
  await PC.saveConfig(cfg);
  refresh();
});

$('toggleSite').addEventListener('click', async () => {
  const url = tab.url;
  if (missing.length) {
    // 已在白名单（或所有网站模式），只差授权
    denied = !(await requestOrigins(missing));
  } else if (PC.isSiteActive(cfg, url)) {
    const matched = hostPatternsFor(url);
    cfg.general.whitelist = cfg.general.whitelist.filter((p) => !matched.includes(p));
    await PC.saveConfig(cfg);
  } else {
    const rule = PC.sitePatternFromUrl(url) || new URL(url).hostname;
    cfg.general.whitelist.push(rule);
    // 先发起保存再请求授权：授权提示弹出时弹窗可能被关闭，白名单仍会保存
    const saving = PC.saveConfig(cfg);
    const granted = await requestOrigins(PC.originPatternsForRule(rule));
    await saving;
    denied = !granted;
  }
  refresh();
});

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  cfg = await PC.loadConfig();
  await refresh();
  checkAnki();
})();
