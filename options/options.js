let cfg;
let lastSaved = '';
let saveTimer;
const openActions = new Set();
let ankiDecks = [];
const tr = PC.t;
const modelLists = new Map(); // providerId -> 已获取的模型列表
let ankiModels = [];

// =============================================================================
// 基础工具
// =============================================================================
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1400);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    lastSaved = JSON.stringify(cfg);
    await PC.saveConfig(cfg);
    toast(tr('已保存'));
    renderWelcome();
  }, 350);
}

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.ok) return reject(new Error(res?.error || tr('未知错误')));
      resolve(res.data);
    });
  });
}

// 绑定控件
function input(obj, key, { type = 'text', placeholder = '', onchange, oninput, cls } = {}) {
  const el = h('input', { type, placeholder, value: obj[key] ?? '', class: cls });
  el.addEventListener('input', () => {
    obj[key] = type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    oninput?.(el);
    save();
  });
  if (onchange) el.addEventListener('change', () => onchange(el));
  return el;
}

function textarea(obj, key, rows = 4, placeholder = '') {
  const el = h('textarea', { rows, placeholder, spellcheck: 'false' });
  el.value = obj[key] ?? '';
  el.addEventListener('input', () => {
    obj[key] = el.value;
    save();
  });
  return el;
}

function select(obj, key, options, onchange) {
  return dropdown(options, obj[key] ?? '', (v) => {
    obj[key] = v;
    save();
    onchange?.(v);
  });
}

const svgIcon = (paths) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = paths;
  return s;
};
const ICON_PATHS = {
  chevron: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
};

// 面板风格的下拉菜单，替代原生 select（原生弹出列表无法自定义样式）
// options: [[value, label], ...]；onpick(value) 在选择后调用
function dropdown(options, value, onpick) {
  const label = h('span', { class: 'dd-label' });
  const btn = h('button', { type: 'button', class: 'dd-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, label, svgIcon(ICON_PATHS.chevron));
  const list = h('div', { class: 'combo-list', role: 'listbox', hidden: true });
  const wrap = h('div', { class: 'dropdown' }, btn, list);
  let cur = value;
  let active = -1;
  const sync = () => (label.textContent = options.find(([v]) => v === cur)?.[1] ?? cur ?? '');
  const items = () => [...list.querySelectorAll('.combo-item')];
  const close = () => {
    list.hidden = true;
    wrap.classList.remove('open', 'up');
    btn.setAttribute('aria-expanded', 'false');
  };
  const pick = (v) => {
    close();
    if (v === cur) return;
    cur = v;
    sync();
    onpick(v);
  };
  const highlight = (i) => {
    const all = items();
    all[active]?.classList.remove('active');
    active = (i + all.length) % all.length;
    all[active].classList.add('active');
    all[active].scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    list.replaceChildren(
      ...options.map(([v, text]) =>
        h('div', { class: 'combo-item' + (v === cur ? ' current' : ''), role: 'option', 'aria-selected': String(v === cur), onmousedown: (e) => (e.preventDefault(), pick(v)) }, text)
      )
    );
    list.hidden = false;
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    // 下方空间不够时向上展开
    const r = btn.getBoundingClientRect();
    if (r.bottom + list.offsetHeight + 16 > innerHeight && r.top > innerHeight - r.bottom) wrap.classList.add('up');
    active = options.findIndex(([v]) => v === cur);
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  };
  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('blur', () => setTimeout(close, 120));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open();
      highlight(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if ((e.key === 'Enter' || e.key === ' ') && !list.hidden && active >= 0) {
      e.preventDefault();
      pick(options[active][0]);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  sync();
  return wrap;
}

// 面板风格的确认弹窗，替代浏览器 confirm / alert；返回 Promise<boolean>
function dialog({ title, message, ok = tr('确定'), cancel = tr('取消'), danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
      prev?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      done(false);
    };
    const okBtn = h('button', { class: danger ? 'danger solid' : 'primary', onclick: () => done(true) }, ok);
    const box = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'dialog-head' }, h('span', { class: 'dialog-icon' + (danger ? ' danger' : '') }, svgIcon(danger ? ICON_PATHS.alert : ICON_PATHS.info)), h('h3', {}, title)),
      message ? h('p', { class: 'dialog-msg' }, message) : null,
      h('div', { class: 'dialog-ops' }, cancel ? h('button', { onclick: () => done(false) }, cancel) : null, okBtn)
    );
    const overlay = h('div', { class: 'overlay', onmousedown: (e) => e.target === overlay && done(false) }, box);
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    okBtn.focus();
  });
}

const confirmDialog = (title, message, opts = {}) => dialog({ title, message, ...opts });
const alertDialog = (title, message) => dialog({ title, message, ok: tr('知道了'), cancel: null });

function checkbox(obj, key, label, onchange) {
  const el = h('input', { type: 'checkbox', checked: !!obj[key] });
  el.addEventListener('change', () => {
    obj[key] = el.checked;
    save();
    onchange?.(el.checked);
  });
  return h('label', { class: 'check' }, el, label);
}

function row(label, control, help) {
  const helpNode = help == null ? null : help instanceof Node ? help : h('div', { class: 'help' }, help);
  return h('div', { class: 'row' }, h('label', {}, label), h('div', {}, control, helpNode));
}

// 带标签的竖排行（标签在上，适合大文本框）
function stack(label, control, help) {
  const r = row(label, control, help);
  r.classList.add('stack');
  return r;
}

// 动作卡片中的分组
function group(title, desc, ...children) {
  return h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', {}, title), desc ? h('p', {}, desc) : null), ...children);
}

function helpHtml(html) {
  const d = h('div', { class: 'help' });
  d.innerHTML = html;
  return d;
}

// 可筛选的下拉输入框，替代原生 datalist：
// 点箭头总是列出全部选项（datalist 会按当前值过滤，值已存在时列表为空），输入时按关键字筛选
function combo(el, getItems, { onEmpty, emptyText = tr('暂无选项') } = {}) {
  const list = h('div', { class: 'combo-list', role: 'listbox', hidden: true });
  const toggle = h('button', { type: 'button', class: 'combo-toggle', title: tr('展开列表'), tabindex: '-1' }, svgIcon(ICON_PATHS.chevron));
  const wrap = h('div', { class: 'combo' }, el, toggle, list);
  let active = -1;
  const items = () => [...list.querySelectorAll('.combo-item')];
  const close = () => {
    list.hidden = true;
    wrap.classList.remove('open');
    active = -1;
  };
  const pick = (v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  };
  const open = (filter) => {
    const q = filter ? el.value.trim().toLowerCase() : '';
    const values = getItems().filter((v) => !q || v.toLowerCase().includes(q));
    if (filter && !values.length) return close();
    active = -1;
    list.replaceChildren(
      ...(values.length
        ? values.map((v) =>
            h('div', { class: 'combo-item' + (v === el.value ? ' current' : ''), role: 'option', onmousedown: (e) => (e.preventDefault(), pick(v)) }, v)
          )
        : [h('div', { class: 'combo-empty' }, emptyText)])
    );
    list.hidden = false;
    wrap.classList.add('open');
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  };
  const move = (d) => {
    const all = items();
    if (!all.length) return;
    all[active]?.classList.remove('active');
    active = (active + d + all.length) % all.length;
    all[active].classList.add('active');
    all[active].scrollIntoView({ block: 'nearest' });
  };
  toggle.addEventListener('mousedown', (e) => e.preventDefault());
  toggle.addEventListener('click', async () => {
    if (!list.hidden) return close();
    el.focus();
    if (!getItems().length && onEmpty) {
      list.replaceChildren(h('div', { class: 'combo-empty' }, tr('加载中…')));
      list.hidden = false;
      wrap.classList.add('open');
      await onEmpty();
    }
    open(false);
  });
  el.addEventListener('input', (e) => e.isTrusted && open(true));
  el.addEventListener('blur', () => setTimeout(close, 120));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open(false);
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && !list.hidden && active >= 0) {
      e.preventDefault();
      pick(items()[active].textContent);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      close();
    }
  });
  wrap.show = () => {
    el.focus();
    open(false);
  };
  return wrap;
}

function resultLine() {
  const el = h('div', { class: 'result' });
  el.set = (text, ok) => {
    el.textContent = text;
    el.className = 'result ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
  };
  return el;
}

function content(id) {
  const c = document.querySelector(`#${id} .content`);
  c.replaceChildren();
  return c;
}

// =============================================================================
// 欢迎提示
// =============================================================================
function renderWelcome() {
  const w = document.getElementById('welcome');
  const noKey = !cfg.providers.some((p) => p.apiKey);
  const noSite = cfg.general.siteMode === 'whitelist' && !cfg.general.whitelist.some((s) => s.trim());
  if (!noKey && !noSite) return w.replaceChildren();
  w.replaceChildren(
    h(
      'div',
      { class: 'banner' },
      h('b', {}, tr('开始使用前还差几步：')),
      h(
        'ol',
        {},
        noKey ? h('li', {}, tr('在「AI 服务」中填写 API Key（默认使用 DeepSeek）。')) : null,
        noSite ? h('li', {}, tr('在「白名单」中添加要划词的网站，或在网页上点击工具栏图标 →「加入白名单」。')) : null,
        h('li', {}, tr('打开 Anki 并安装 AnkiConnect 插件（代码 2055492159），然后在「Anki 与发音」中点击“测试连接”。'))
      )
    )
  );
}

// =============================================================================
// 主题
// =============================================================================
const THEME_PREVIEW = {
  dusk: { desc: '纸白 · 墨蓝 · 粉蓝紫点缀', swatches: ['#f5f3f2', '#68769b', '#e6b8b5', '#b8cbda', '#d7cee7'] },
  lagoon: { desc: '浅苔 · 湖绿 · 金色点缀', swatches: ['#f4f6f0', '#608b77', '#82afa0', '#b7c9a0', '#ebc86c'] },
};

function applyTheme() {
  const theme = PC.themeOf(cfg);
  document.documentElement.dataset.theme = theme;
  const icon = '../icons/' + PC.THEMES[theme].icon;
  document.querySelector('.brand img').src = icon;
  document.querySelector('link[rel=icon]').href = icon;
}

function themePicker() {
  return h(
    'div',
    { class: 'themes', role: 'radiogroup' },
    Object.entries(PC.THEMES).map(([key, t]) =>
      h(
        'button',
        {
          class: 'theme' + (PC.themeOf(cfg) === key ? ' on' : ''),
          role: 'radio',
          'aria-checked': String(PC.themeOf(cfg) === key),
          onclick: () => {
            cfg.general.theme = key;
            save();
            applyTheme();
            renderGeneral();
          },
        },
        h('img', { src: '../icons/' + t.icon, alt: '' }),
        h('span', { class: 'theme-text' }, h('b', {}, tr(t.name)), h('small', {}, tr(THEME_PREVIEW[key].desc))),
        h('span', { class: 'swatches' }, THEME_PREVIEW[key].swatches.map((c) => h('i', { style: `background:${c}` })))
      )
    )
  );
}

// 划词按钮样式：Standard（图标 + 名称 + 快捷键）/ Lite（只显示图标）
function toolbarStylePicker() {
  const acts = cfg.actions.filter((a) => a.enabled);
  const style = cfg.general.toolbarStyle === 'lite' ? 'lite' : 'standard';
  const preview = (lite) =>
    h(
      'span',
      { class: 'tb-preview' + (lite ? ' lite' : '') },
      acts.map((a) => h('span', { class: 'tb-btn' }, h('span', { class: 'ic' }, PC.iconNode(a.icon)), lite ? null : h('span', {}, a.name), !lite && a.shortcut ? h('kbd', {}, a.shortcut) : null))
    );
  return h(
    'div',
    { class: 'themes' },
    [
      ['standard', 'Standard', tr('图标 + 名称 + 快捷键')],
      ['lite', 'Lite', tr('只显示图标，悬停查看名称')],
    ].map(([key, name, desc]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'theme choice' + (style === key ? ' on' : ''),
          role: 'radio',
          'aria-checked': String(style === key),
          onclick: () => {
            cfg.general.toolbarStyle = key;
            save();
            renderGeneral();
          },
        },
        h('span', { class: 'theme-text' }, h('b', {}, name), h('small', {}, desc)),
        preview(key === 'lite')
      )
    )
  );
}

// =============================================================================
// 通用
// =============================================================================
function renderGeneral() {
  const c = content('general');
  const g = cfg.general;
  const cacheInfo = h('span', { class: 'cache-info' });
  const refreshCacheInfo = async () => {
    try {
      const st = await PC.cacheStats();
      cacheInfo.textContent = tr('已缓存 {count} 条 · {kb} KB', { count: st.count, kb: Math.max(st.count ? 1 : 0, Math.round(st.bytes / 1024)) });
    } catch {
      cacheInfo.textContent = '';
    }
  };
  refreshCacheInfo();
  const wl = h('textarea', { rows: 6, spellcheck: 'false', placeholder: tr('*.arxiv.org\n*.x.com\n直接粘贴网址会自动转换为 *.域名') });
  wl.value = g.whitelist.join('\n');
  wl.addEventListener('input', () => {
    g.whitelist = wl.value.split('\n').map((s) => s.trim()).filter(Boolean);
    save();
  });
  // 粘贴网址时自动转换为通用域名，例如 https://www.nytimes.com/2026/… → *.nytimes.com
  wl.addEventListener('paste', (e) => {
    const lines = e.clipboardData.getData('text').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const isUrl = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^www\./i.test(s) || /^[^/\s]+\.[^/\s]+\//.test(s);
    let converted = false;
    const out = lines.map((s) => {
      const p = isUrl(s) && PC.sitePatternFromUrl(s);
      if (p) converted = true;
      return p || s;
    });
    if (!converted) return;
    e.preventDefault();
    const existing = new Set(wl.value.split('\n').map((s) => s.trim()));
    const added = [...new Set(out)].filter((s) => !existing.has(s));
    if (!added.length) return toast(tr('已在白名单中'));
    const before = wl.value.slice(0, wl.selectionStart);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    document.execCommand('insertText', false, prefix + added.join('\n'));
    toast(tr('已转换为 {list}', { list: added.join(tr('、')) }));
  });
  c.append(
    h(
      'div',
      { class: 'card' },
      row(
        tr('界面语言'),
        select(g, 'uiLanguage', PC.UI_LANGUAGES, (v) => {
          PC.setLang(v);
          renderAll();
        }),
        helpHtml(tr('设置页、划词面板、工具栏弹窗的显示语言。不影响 AI 输出的语言（见下方「目标语言」）。'))
      ),
      row(tr('主题'), themePicker(), helpHtml(tr('同时作用于划词面板、设置页、工具栏弹窗、图标和 Anki 卡片。'))),
      row(tr('启用插件'), checkbox(g, 'enabled', tr('启用划词'))),
      row(
        tr('生效范围'),
        select(g, 'siteMode', [
          ['whitelist', tr('仅白名单网站')],
          ['all', tr('所有网站')],
        ])
      ),
      row(
        tr('白名单'),
        wl,
        helpHtml(
          tr('每行一条。直接粘贴网址会自动转换为 <code>*.域名</code>。<code>*.example.com</code> 或 <code>example.com</code> 匹配该域名及全部子域名；<code>https://x.com/*/status/*</code> 通配符匹配完整网址；<code>/regex/</code> 正则匹配。以 <code>#</code> 开头的行会被忽略。')
        )
      ),
      row(
        tr('工具栏'),
        select(g, 'toolbarTrigger', [
          ['auto', tr('划词后自动显示动作按钮')],
          ['shortcut', tr('不显示，仅使用快捷键')],
        ])
      ),
      row(tr('按钮样式'), toolbarStylePicker()),
      row(
        tr('结果缓存'),
        h(
          'div',
          { class: 'inline' },
          checkbox(g, 'cacheResults', tr('再次划选同一内容时直接显示上次结果')),
          cacheInfo,
          h(
            'button',
            {
              class: 'small',
              onclick: async () => {
                if (!(await confirmDialog(tr('清除全部缓存？'), tr('已缓存的划词结果会被删除，再次划选时将重新请求 AI。'), { ok: tr('清除'), danger: true }))) return;
                await PC.cacheClear();
                refreshCacheInfo();
                toast(tr('已清除缓存'));
              },
            },
            tr('清除缓存')
          )
        ),
        helpHtml(tr('同一页面、同一动作、同一选区（及所在段落）再次划选时不再请求 AI，节省 Token。修改提示词、输出字段或模型后自动失效；面板右上角的「重新生成」会跳过缓存。'))
      ),
      row(
        tr('目标语言'),
        combo(input(g, 'targetLanguage', { placeholder: '简体中文' }), () => PC.TARGET_LANGUAGES),
        helpHtml(tr('提示词中的 <code>{{targetLanguage}}</code> 变量。可从列表中选择常用语言，也可以直接输入。'))
      ),
      row(tr('上下文长度'), input(g, 'maxContextChars', { type: 'number' }), helpHtml(tr('<code>{{paragraphs}}</code> 最多截取的字符数。')))
    )
  );
}

// =============================================================================
// AI 服务
// =============================================================================
function renderProviders() {
  const c = content('providers');
  cfg.providers.forEach((p, idx) => {
    const res = resultLine();
    const key = input(p, 'apiKey', { type: 'password', placeholder: 'sk-...' });
    const eye = h('button', { class: 'small', onclick: () => (key.type = key.type === 'password' ? 'text' : 'password') }, tr('显示'));
    const fetchModels = async () => {
      res.set(tr('正在获取模型列表…'));
      try {
        const list = await send('ai:models', { provider: p });
        modelLists.set(p.id, list);
        res.set(tr('获取到 {n} 个模型', { n: list.length }), true);
      } catch (e) {
        res.set(e.message, false);
      }
    };
    const modelBox = combo(input(p, 'model', { placeholder: tr('模型名称') }), () => modelLists.get(p.id) || [], {
      onEmpty: fetchModels,
      emptyText: tr('没有获取到模型，可直接输入模型名称'),
    });
    c.append(
      h(
        'div',
        { class: 'card' },
        row(tr('名称'), input(p, 'name', { onchange: () => renderActions() })),
        row(
          tr('接口类型'),
          select(p, 'type', [
            ['openai', tr('OpenAI 兼容（DeepSeek / OpenAI / OpenRouter / 硅基流动 / Kimi / 通义 / 智谱 / Ollama …）')],
            ['anthropic', 'Anthropic Claude'],
            ['gemini', 'Google Gemini'],
          ])
        ),
        row('Base URL', input(p, 'baseURL', { placeholder: 'https://api.deepseek.com' }), helpHtml(tr('OpenAI 兼容接口会自动拼接 <code>/chat/completions</code>。'))),
        row('API Key', h('div', { class: 'inline' }, key, eye), helpHtml(tr('只保存在本机浏览器中，仅用于直接请求上面的接口。'))),
        row(
          tr('模型'),
          h(
            'div',
            { class: 'inline' },
            modelBox,
            h(
              'button',
              {
                class: 'small',
                onclick: async () => {
                  await fetchModels();
                  if (modelLists.get(p.id)?.length) modelBox.show();
                },
              },
              tr('获取模型列表')
            )
          )
        ),
        row('Temperature', input(p, 'temperature', { type: 'number', placeholder: tr('留空使用模型默认值') }), helpHtml(tr('推理模型（如 deepseek-reasoner、o 系列）建议留空。'))),
        row(tr('JSON 模式'), checkbox(p, 'jsonMode', tr('请求结构化 JSON 输出（response_format / responseMimeType）')), helpHtml(tr('若服务商不支持该参数导致 400 错误，请关闭。Anthropic 忽略此项。'))),
        h(
          'div',
          { class: 'footer-ops' },
          h(
            'button',
            {
              class: 'primary',
              onclick: async () => {
                res.set(tr('正在测试…'));
                try {
                  const r = await send('ai:test', { provider: p });
                  res.set(tr(r.json ? '连接成功，JSON 输出正常：{reply}' : '连接成功（但未返回 JSON，建议开启 JSON 模式）：{reply}', { reply: r.reply }), true);
                } catch (e) {
                  res.set(e.message, false);
                }
              },
            },
            tr('测试连接')
          ),
          h(
            'button',
            {
              class: 'danger',
              disabled: cfg.providers.length <= 1,
              onclick: async () => {
                if (!(await confirmDialog(tr('删除 AI 服务「{name}」？', { name: p.name }), tr('使用该服务的划词动作会改用第一个 AI 服务。'), { ok: tr('删除'), danger: true }))) return;
                cfg.providers.splice(idx, 1);
                for (const a of cfg.actions) if (a.providerId === p.id) a.providerId = cfg.providers[0].id;
                save();
                renderProviders();
                renderActions();
              },
            },
            tr('删除')
          )
        ),
        res
      )
    );
  });
  const preset = { key: PC.PROVIDER_PRESETS[0].key };
  c.append(
    h(
      'div',
      { class: 'inline add-provider' },
      dropdown(
        PC.PROVIDER_PRESETS.map((p) => [p.key, tr(p.name)]),
        preset.key,
        (v) => (preset.key = v)
      ),
      h(
        'button',
        {
          onclick: () => {
            const p = PC.PROVIDER_PRESETS.find((x) => x.key === preset.key);
            cfg.providers.push({ id: PC.uid(), name: tr(p.name), type: p.type, baseURL: p.baseURL, apiKey: '', model: p.model, temperature: 0.3, jsonMode: p.type !== 'anthropic' });
            save();
            renderProviders();
            renderActions();
          },
        },
        tr('＋ 添加 AI 服务')
      )
    )
  );
}

// =============================================================================
// 划词动作
// =============================================================================
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FILL_OPTIONS = [
  ['ai', 'AI 生成'],
  ['selection', '划选文本'],
  ['webTitle', '网页标题'],
  ['webUrl', '网页链接'],
  ['paragraphs', '所在段落'],
];

function renderActions() {
  const c = content('actions');
  c.append(
    h(
      'div',
      { class: 'intro' },
      h('p', {}, tr('每个动作会把划选内容连同上下文发给 AI，按「输出字段」返回 JSON，再用「面板布局」渲染出来，并可一键写入 Anki。')),
      h('div', { class: 'vars' }, h('span', {}, tr('提示词变量')), ['selection', 'paragraphs', 'webTitle', 'webUrl', 'targetLanguage'].map((v) => h('code', {}, `{{${v}}}`)))
    )
  );
  cfg.actions.forEach((a, idx) => c.append(actionCard(a, idx)));
  c.append(
    h(
      'div',
      { class: 'inline', style: 'margin-top:8px' },
      h(
        'button',
        {
          onclick: () => {
            const a = PC.newAction();
            a.name = tr(a.name);
            a.providerId = cfg.providers[0].id;
            cfg.actions.push(a);
            openActions.add(a.id);
            save();
            renderActions();
          },
        },
        tr('＋ 新建动作')
      )
    )
  );
}

function actionCard(a, idx) {
  const det = h('details', { class: 'action', open: openActions.has(a.id) });
  det.addEventListener('toggle', () => (det.open ? openActions.add(a.id) : openActions.delete(a.id)));
  const fieldNames = a.outputSchema.map((f) => f.name).filter(Boolean);
  const providerName = cfg.providers.find((p) => p.id === a.providerId)?.name || tr('未选择');
  det.append(
    h(
      'summary',
      {},
      h('span', { class: 'chev' }, '▶'),
      h('span', { class: 'chip', style: `--c:var(${['--c1', '--c2', '--c3'][idx % 3]})` }, PC.iconNode(a.icon)),
      h('span', { class: 'titles' }, h('span', { class: 'name' }, a.name), h('span', { class: 'meta' }, `${providerName} · ${a.shortcut || tr('无快捷键')} · ${a.anki.deck}`)),
      h('span', { class: 'tag' + (a.enabled ? '' : ' off') }, a.enabled ? tr('已启用') : tr('已停用'))
    )
  );

  const inner = h('div', { class: 'inner' });
  det.append(inner);

  // 基本
  const shortcut = h('input', { value: a.shortcut || '', placeholder: tr('点击后按下组合键，Backspace 清除'), readonly: true });
  shortcut.addEventListener('keydown', (e) => {
    e.preventDefault();
    if (e.key === 'Backspace' || e.key === 'Delete') a.shortcut = '';
    else {
      const combo = PC.comboFromEvent(e);
      if (!combo) return;
      a.shortcut = combo;
    }
    shortcut.value = a.shortcut;
    save();
  });
  inner.append(
    group(
      tr('基本'),
      '',
      row(tr('状态'), h('div', { class: 'inline' }, checkbox(a, 'enabled', tr('启用')), checkbox(a, 'autoAddToAnki', tr('生成完成后自动添加到 Anki')))),
      row(tr('名称'), h('div', { class: 'inline' }, iconPicker(a), input(a, 'name')), helpHtml(tr('点击左侧图标可从线条图标、Emoji 中选择，或输入文字、上传图片。'))),
      row(
        tr('AI 服务'),
        select(
          a,
          'providerId',
          cfg.providers.map((p) => [p.id, `${p.name}（${p.model || tr('未填模型')}）`])
        )
      ),
      row(tr('快捷键'), shortcut, helpHtml(tr('选中文字后按下即可触发，在输入框中不生效。')))
    )
  );

  // 提示词
  inner.append(
    group(
      tr('提示词'),
      tr('输出字段的 JSON 格式要求会自动追加到 System Prompt 末尾，无需手写。'),
      stack('System Prompt', textarea(a, 'systemPrompt', 10)),
      stack('User Prompt', textarea(a, 'prompt', 8))
    )
  );

  // 输出字段
  const fieldList = h('div', { class: 'fields' });
  a.outputSchema.forEach((f, i) => {
    const name = input(f, 'name', {
      placeholder: tr('字段名'),
      oninput: (el) => el.classList.toggle('invalid', !FIELD_NAME_RE.test(el.value)),
      onchange: () => renderActions(),
    });
    if (!FIELD_NAME_RE.test(f.name)) name.classList.add('invalid');
    const move = (d) => {
      const j = i + d;
      if (j < 0 || j >= a.outputSchema.length) return;
      [a.outputSchema[i], a.outputSchema[j]] = [a.outputSchema[j], a.outputSchema[i]];
      save();
      renderActions();
    };
    const fillLabel = tr(FILL_OPTIONS.find(([v]) => v === f.fill)?.[1] || '');
    fieldList.append(
      h(
        'div',
        { class: 'field-item' },
        h(
          'div',
          { class: 'field-top' },
          h('span', { class: 'field-no' }, String(i + 1).padStart(2, '0')),
          name,
          select(f, 'fill', FILL_OPTIONS.map(([v, l]) => [v, tr(l)]), () => renderActions()),
          h(
            'div',
            { class: 'field-ops' },
            h('button', { class: 'small', title: tr('上移'), 'aria-label': tr('上移'), disabled: i === 0, onclick: () => move(-1) }, svgIcon(ICON_PATHS.up)),
            h('button', { class: 'small', title: tr('下移'), 'aria-label': tr('下移'), disabled: i === a.outputSchema.length - 1, onclick: () => move(1) }, svgIcon(ICON_PATHS.down)),
            h(
              'button',
              {
                class: 'small danger',
                title: tr('删除'),
                'aria-label': tr('删除'),
                onclick: () => {
                  a.outputSchema.splice(i, 1);
                  save();
                  renderActions();
                },
              },
              svgIcon(ICON_PATHS.close)
            )
          )
        ),
        f.fill === 'ai'
          ? textarea(f, 'description', 2, tr('给 AI 的要求，例如：用简体中文说明它在原句中的含义'))
          : h('div', { class: 'field-note' }, tr('由插件直接填写「{fill}」，不交给 AI，不消耗 Token。', { fill: fillLabel }))
      )
    );
  });
  inner.append(
    group(
      tr('输出字段'),
      tr('字段名只能包含英文字母、数字和下划线，同时作为 Anki 字段名。'),
      fieldList,
      h(
        'button',
        {
          class: 'small add-field',
          onclick: () => {
            a.outputSchema.push({ id: PC.uid(), name: 'Field' + (a.outputSchema.length + 1), description: '', fill: 'ai' });
            save();
            renderActions();
          },
        },
        tr('＋ 添加字段')
      )
    )
  );

  // 显示布局
  inner.append(
    group(
      tr('面板布局'),
      '',
      stack(
        tr('布局模板'),
        textarea(a, 'layout', 10, tr('留空则按字段自动显示')),
        helpHtml(tr('HTML + Liquid 语法：<code>{{ Field }}</code>、<code>{{ Field | newline_to_br }}</code>、<code>{% if Field %}…{% endif %}</code>、<code>&lt;details&gt;</code> 折叠块。'))
      )
    )
  );

  // Anki
  const deck = combo(input(a.anki, 'deck', { placeholder: 'Phrase Collector::Phrases' }), () => ankiDecks, {
    onEmpty: fetchDecks,
    emptyText: tr('没有读取到牌组，请确认 Anki 已打开'),
  });
  const fieldOptions = [['', tr('（不发音）')], ...fieldNames.map((n) => [n, n])];
  const ankiGroup = group(
    tr('Anki 卡片'),
    '',
    row(tr('牌组'), deck, helpHtml(tr('牌组不存在时会自动创建，用 <code>::</code> 表示子牌组。在划词面板中修改牌组也会同步到这里。'))),
    row(tr('标签'), input(a.anki, 'tags', { placeholder: tr('空格分隔') })),
    row(tr('发音字段'), select(a.anki, 'ttsField', fieldOptions), helpHtml(tr('卡片正面朗读哪个字段，发音方式在「Anki 与发音」中设置。'))),
    row(tr('重复卡片'), checkbox(a.anki, 'allowDuplicate', tr('允许添加重复卡片（默认同一牌组首字段重复时拒绝）')), helpHtml(tr('也可以在划词面板底部的重复按钮中直接切换，两处同步。'))),
    row(
      tr('笔记类型'),
      select(
        a.anki,
        'modelMode',
        [
          ['managed', tr('插件托管（自动创建并维护笔记类型，推荐）')],
          ['existing', tr('使用 Anki 中已有的笔记类型（自定义字段映射）')],
        ],
        () => renderActions()
      )
    )
  );
  inner.append(ankiGroup);
  ankiGroup.append(a.anki.modelMode === 'existing' ? existingModelBlock(a, fieldNames) : managedModelBlock(a, fieldNames));

  // 底部操作
  inner.append(
    h(
      'div',
      { class: 'footer-ops' },
      a.builtin
        ? h(
            'button',
            {
              onclick: async () => {
                if (!(await confirmDialog(tr('将「{name}」恢复为默认设置？', { name: a.name }), tr('提示词、输出字段、面板布局和卡片模板会恢复默认，牌组与快捷键会保留。'), { ok: tr('恢复默认') }))) return;
                const def = PC.builtinDefaults(a.builtin);
                cfg.actions[idx] = { ...def, id: a.id, enabled: a.enabled, shortcut: a.shortcut, providerId: a.providerId, anki: { ...def.anki, deck: a.anki.deck } };
                save();
                renderActions();
              },
            },
            tr('恢复默认')
          )
        : null,
      h(
        'button',
        {
          onclick: () => {
            const copy = JSON.parse(JSON.stringify(a));
            copy.id = PC.uid();
            delete copy.builtin;
            copy.name += tr(' 副本');
            copy.shortcut = '';
            copy.anki.modelName += tr(' 副本');
            cfg.actions.splice(idx + 1, 0, copy);
            openActions.add(copy.id);
            save();
            renderActions();
          },
        },
        tr('复制')
      ),
      h('button', { disabled: idx === 0, onclick: () => moveAction(idx, -1) }, tr('上移')),
      h('button', { disabled: idx === cfg.actions.length - 1, onclick: () => moveAction(idx, 1) }, tr('下移')),
      h(
        'button',
        {
          class: 'danger',
          onclick: async () => {
            if (!(await confirmDialog(tr('删除动作「{name}」？', { name: a.name }), tr('删除后无法恢复。'), { ok: tr('删除'), danger: true }))) return;
            cfg.actions.splice(idx, 1);
            save();
            renderActions();
          },
        },
        tr('删除')
      )
    )
  );
  return det;
}

// =============================================================================
// 动作图标选择器
// =============================================================================
const ICON_TABS = [
  ['svg', '线条图标'],
  ['emoji', 'Emoji'],
  ['custom', '自定义'],
];
let closeOpenIconPop = null;

function iconPicker(a) {
  const btn = h('button', { type: 'button', class: 'icon-btn', title: tr('选择图标') }, PC.iconNode(a.icon));
  const pop = h('div', { class: 'icon-pop', hidden: true });
  const wrap = h('div', { class: 'icon-pick' }, btn, pop);
  const cur = String(a.icon || '');
  let tab = cur.startsWith('svg:') ? 'svg' : cur.startsWith('data:') ? 'custom' : 'emoji';
  const onDoc = (e) => !wrap.contains(e.target) && close();
  const close = () => {
    pop.hidden = true;
    document.removeEventListener('mousedown', onDoc, true);
    if (closeOpenIconPop === close) closeOpenIconPop = null;
  };
  const set = (v) => {
    a.icon = v;
    save();
    close();
    renderActions();
  };
  const cell = (value, title) => h('button', { type: 'button', class: 'icon-cell' + (a.icon === value ? ' on' : ''), title, onclick: () => set(value) }, PC.iconNode(value));
  const render = () => {
    const tabs = h(
      'div',
      { class: 'icon-tabs' },
      ICON_TABS.map(([k, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: tab === k ? 'on' : '',
            onclick: () => {
              tab = k;
              render();
            },
          },
          tr(label)
        )
      )
    );
    let body;
    if (tab === 'svg') body = h('div', { class: 'icon-grid' }, Object.keys(PC.ICON_LIBRARY).map((n) => cell('svg:' + n, n)));
    else if (tab === 'emoji') body = h('div', { class: 'icon-grid' }, PC.EMOJI_LIBRARY.map((e) => cell(e, e)));
    else {
      const text = h('input', { placeholder: tr('任意 emoji 或 1–2 个字'), value: /^(svg:|data:)/.test(cur) ? '' : cur });
      const useText = () => text.value.trim() && set(text.value.trim());
      text.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), useText()));
      const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', style: 'display:none' });
      file.addEventListener('change', async () => {
        const f = file.files[0];
        file.value = '';
        if (!f) return;
        try {
          set(await imageToIcon(f));
        } catch (e) {
          toast(e.message);
        }
      });
      body = h(
        'div',
        { class: 'icon-custom' },
        h('label', {}, tr('文字或 Emoji')),
        h('div', { class: 'inline' }, text, h('button', { type: 'button', class: 'small primary', onclick: useText }, tr('使用'))),
        h('label', {}, tr('图片')),
        h('div', { class: 'inline' }, h('button', { type: 'button', class: 'small', onclick: () => file.click() }, tr('上传图片')), file, h('span', { class: 'help' }, tr('PNG / JPG / SVG，自动缩放为 64×64')))
      );
    }
    pop.replaceChildren(tabs, body);
  };
  btn.addEventListener('click', () => {
    if (!pop.hidden) return close();
    closeOpenIconPop?.();
    render();
    pop.hidden = false;
    closeOpenIconPop = close;
    document.addEventListener('mousedown', onDoc, true);
  });
  return wrap;
}

// 上传的图片缩放为 64×64 PNG（data URL），保存在配置中
function imageToIcon(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error(tr('图片太大，请选择小于 2MB 的图片')));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const iw = img.naturalWidth || size;
      const ih = img.naturalHeight || size;
      const k = Math.min(size / iw, size / ih);
      const canvas = h('canvas', { width: size, height: size });
      canvas.getContext('2d').drawImage(img, (size - iw * k) / 2, (size - ih * k) / 2, iw * k, ih * k);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(tr('无法读取这张图片')));
    };
    img.src = url;
  });
}

function moveAction(idx, d) {
  const j = idx + d;
  [cfg.actions[idx], cfg.actions[j]] = [cfg.actions[j], cfg.actions[idx]];
  save();
  renderActions();
}

function managedModelBlock(a, fieldNames) {
  const fieldOptions = [['', tr('（不高亮）')], ...fieldNames.map((n) => [n, n])];
  const res = resultLine();
  const wrap = h('div', {});
  wrap.append(
    row(
      tr('笔记类型名称'),
      input(a.anki, 'modelName'),
      helpHtml(tr('字段：{fields}。不存在时自动创建；新增的输出字段会自动加到笔记类型中。', { fields: [...fieldNames, 'Audio'].map((n) => `<code>${PC.escapeHtml(n)}</code>`).join(' ') }))
    ),
    row(
      tr('原句高亮'),
      h('div', { class: 'inline' }, select(a.anki, 'highlightField', fieldOptions), h('span', {}, tr('中高亮')), select(a.anki, 'highlightTerm', [['', tr('（无）')], ...fieldNames.map((n) => [n, n])])),
      helpHtml(tr('在卡片中把表达在原句里加粗高亮；找不到时退回高亮划选原文。'))
    )
  );
  const tpl = h(
    'details',
    { class: 'sub' },
    h('summary', {}, tr('卡片模板（高级）')),
    helpHtml(
      tr('使用 Anki 模板语法。<code>[[TTS]]</code> 会按发音设置替换为 <code>{{tts …}}</code> 或在线音频。留空则按字段自动生成。托管模式下，Anki 中的模板以这里为准，手动在 Anki 中修改会被覆盖。')
    ),
    row(tr('正面'), textarea(a.anki, 'front', 8)),
    row(tr('背面'), textarea(a.anki, 'back', 10)),
    row(tr('样式 CSS'), textarea(a.anki, 'css', 8)),
    h(
      'div',
      { class: 'footer-ops' },
      h(
        'button',
        {
          onclick: () => {
            const def = a.builtin ? PC.builtinDefaults(a.builtin).anki : { front: '', back: '', css: '' };
            Object.assign(a.anki, { front: def.front, back: def.back, css: def.css });
            save();
            renderActions();
          },
        },
        a.builtin ? tr('恢复默认模板') : tr('清空（自动生成）')
      ),
      h(
        'button',
        {
          class: 'primary',
          onclick: async () => {
            res.set(tr('同步中…'));
            await flushSave();
            try {
              const done = await send('anki:sync');
              res.set(tr('已同步：{list}', { list: done.join(tr('、')) }), true);
            } catch (e) {
              res.set(e.message, false);
            }
          },
        },
        tr('同步到 Anki')
      )
    ),
    res
  );
  wrap.append(tpl);
  return wrap;
}

function existingModelBlock(a, fieldNames) {
  const res = resultLine();
  const wrap = h('div', { class: 'mapping' });
  const modelSel = dropdown(
    [[a.anki.modelName, a.anki.modelName || tr('（请选择）')], ...ankiModels.filter((m) => m !== a.anki.modelName).map((m) => [m, m])],
    a.anki.modelName,
    (v) => {
      a.anki.modelName = v;
      a.anki.fieldMap = {};
      save();
      loadFields();
    }
  );
  const mapBox = h('div', {});
  const renderMap = (fields) => {
    a.anki.fieldMap = a.anki.fieldMap || {};
    const vars = (a.outputSchema || []).map((f) => f.name).filter(Boolean);
    for (const f of fields) if (!(f in a.anki.fieldMap)) a.anki.fieldMap[f] = vars.includes(f) ? `{{${f}}}` : '';
    for (const k of Object.keys(a.anki.fieldMap)) if (!fields.includes(k)) delete a.anki.fieldMap[k];
    save();
    mapBox.replaceChildren(...fields.map((f) => row(f, input(a.anki.fieldMap, f, { placeholder: tr('例如 {{Expression}}') }))));
  };
  const loadFields = async () => {
    if (!a.anki.modelName) return;
    res.set(tr('读取字段中…'));
    try {
      renderMap(await send('anki:fields', { modelName: a.anki.modelName }));
      res.set('');
    } catch (e) {
      res.set(e.message, false);
    }
  };
  if (Object.keys(a.anki.fieldMap || {}).length) {
    mapBox.append(...Object.keys(a.anki.fieldMap).map((f) => row(f, input(a.anki.fieldMap, f, { placeholder: tr('例如 {{Expression}}') }))));
  }
  wrap.append(
    row(tr('笔记类型'), h('div', { class: 'inline' }, modelSel, h('button', { class: 'small', onclick: () => loadAnkiLists(true) }, tr('从 Anki 读取')), h('button', { class: 'small', onclick: loadFields }, tr('读取字段')))),
    helpHtml(
      tr('为每个 Anki 字段填写内容模板，可用变量：{vars}。<code>{{Audio}}</code> 仅在发音方式为“在线音频”时有值。', {
        vars: [...fieldNames, 'selection', 'paragraphs', 'webTitle', 'webUrl', 'Audio'].map((n) => `<code>{{${PC.escapeHtml(n)}}}</code>`).join(' '),
      })
    ),
    mapBox,
    res
  );
  return wrap;
}

async function fetchDecks() {
  try {
    ankiDecks = await send('anki:decks');
  } catch {
    // Anki 未打开时列表为空，下拉框会显示提示
  }
}

async function loadAnkiLists(notify) {
  try {
    [ankiDecks, ankiModels] = await Promise.all([send('anki:decks'), send('anki:models')]);
    if (notify) toast(tr('读取到 {decks} 个牌组、{models} 个笔记类型', { decks: ankiDecks.length, models: ankiModels.length }));
    // 只更新候选列表，避免打断正在编辑的输入框
    if (notify || cfg.actions.some((a) => a.anki.modelMode === 'existing')) renderActions();
  } catch (e) {
    if (notify) alertDialog(tr('读取 Anki 失败'), e.message);
  }
}

// =============================================================================
// Anki 与发音
// =============================================================================
function renderAnki() {
  const c = content('anki');
  const k = cfg.anki;
  const res = resultLine();
  const syncRes = resultLine();
  const audioRow = row(
    tr('在线音频来源'),
    select(k, 'audioSource', [
      ['youdao-us', tr('有道 美音')],
      ['youdao-uk', tr('有道 英音')],
      ['google', tr('Google 翻译（≤200 字符）')],
    ])
  );
  const toggleAudio = () => (audioRow.style.display = k.ttsMode === 'audio' ? '' : 'none');
  c.append(
    h(
      'div',
      { class: 'card' },
      h('h3', { style: 'margin-top:0' }, 'AnkiConnect'),
      row(tr('地址'), input(k, 'url'), helpHtml(tr('需要在 Anki 中安装 <b>AnkiConnect</b> 插件（工具 → 插件 → 获取插件，代码 <code>2055492159</code>），并保持 Anki 运行。'))),
      row('API Key', input(k, 'apiKey', { type: 'password', placeholder: tr('未在 AnkiConnect 中设置则留空') })),
      h(
        'div',
        { class: 'footer-ops' },
        h(
          'button',
          {
            class: 'primary',
            onclick: async () => {
              res.set(tr('正在连接…（首次连接时请在 Anki 弹出的授权窗口中点击 Yes）'));
              try {
                const r = await send('anki:test');
                res.set(tr('连接成功，AnkiConnect 版本 {version}', { version: r.version }), true);
                loadAnkiLists(false);
              } catch (e) {
                res.set(e.message, false);
              }
            },
          },
          tr('测试连接')
        )
      ),
      res
    ),
    h(
      'div',
      { class: 'card' },
      h('h3', { style: 'margin-top:0' }, tr('卡片发音 (TTS)')),
      row(
        tr('发音方式'),
        select(
          k,
          'ttsMode',
          [
            ['anki', tr('Anki 内置 TTS（{{tts}} 标签，使用系统语音，不占空间）')],
            ['audio', tr('下载在线真人/合成音频到卡片（失败时回退到 Anki TTS）')],
            ['off', tr('不发音')],
          ],
          toggleAudio
        ),
        helpHtml(tr('Anki 内置 TTS 在电脑版和 AnkiDroid 上使用系统语音；AnkiMobile/AnkiWeb 不支持时可选“在线音频”。修改后点击下方“同步模板”生效于已有卡片。'))
      ),
      row(tr('语言'), input(k, 'ttsLang', { placeholder: 'en_US' }), helpHtml(tr('Anki TTS 语言代码，如 <code>en_US</code>、<code>en_GB</code>。'))),
      row(tr('指定语音'), input(k, 'ttsVoices', { placeholder: tr('留空使用系统默认，如 Microsoft_Aria,Apple_Samantha') }), helpHtml(tr('多个用逗号分隔，按顺序选用第一个可用的。可在 Anki 卡片模板编辑器中输入 <code>{{tts-voices:}}</code> 查看可用语音。'))),
      row(tr('语速'), input(k, 'ttsSpeed', { type: 'number' })),
      audioRow,
      h(
        'div',
        { class: 'footer-ops' },
        h(
          'button',
          {
            onclick: async () => {
              syncRes.set(tr('同步中…'));
              await flushSave();
              try {
                const done = await send('anki:sync');
                syncRes.set(done.length ? tr('已同步笔记类型：{list}', { list: done.join(tr('、')) }) : tr('没有托管的笔记类型'), true);
              } catch (e) {
                syncRes.set(e.message, false);
              }
            },
          },
          tr('同步模板到 Anki')
        )
      ),
      syncRes
    )
  );
  toggleAudio();
}

// =============================================================================
// 备份
// =============================================================================
function importReadFrogActions(list) {
  return list.map((ra) => {
    const a = PC.newAction();
    a.name = ra.name || a.name;
    a.systemPrompt = ra.systemPrompt || '';
    a.prompt = ra.prompt || '';
    a.layout = ra.layout || '';
    a.shortcut = ra.shortcut || '';
    a.enabled = ra.enabled !== false;
    a.providerId = cfg.providers[0].id;
    a.outputSchema = (ra.outputSchema || []).map((f) => ({ id: PC.uid(), name: f.name, description: f.description || '', fill: 'ai' }));
    a.anki.modelName = 'Phrase Collector · ' + a.name;
    a.anki.ttsField = a.outputSchema[0]?.name || '';
    return a;
  });
}

function renderBackup() {
  const c = content('backup');
  const withKeys = { v: false };
  const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const rf = json.customActions || json.selectionToolbar?.customActions;
      if (Array.isArray(rf)) {
        const added = importReadFrogActions(rf);
        if (!(await confirmDialog(tr('检测到 {n} 个 Read Frog 自定义动作', { n: added.length }), tr('要追加到划词动作中吗？'), { ok: tr('追加') }))) return;
        cfg.actions.push(...added);
      } else {
        if (!json.actions || !json.providers) throw new Error(tr('不是 Phrase Collector 配置文件'));
        if (!(await confirmDialog(tr('导入并覆盖当前设置？'), tr('当前全部设置会被替换为文件中的配置，已填写的 API Key 会保留。'), { ok: tr('导入'), danger: true }))) return;
        const keep = new Map(cfg.providers.map((p) => [p.id, p.apiKey]));
        cfg = PC.normalizeConfig(json);
        for (const p of cfg.providers) if (!p.apiKey && keep.get(p.id)) p.apiKey = keep.get(p.id);
      }
      save();
      renderAll();
      toast(tr('导入成功'));
    } catch (e) {
      alertDialog(tr('导入失败'), e.message);
    }
  });
  c.append(
    h(
      'div',
      { class: 'card' },
      row(
        tr('导出'),
        h(
          'div',
          { class: 'inline' },
          h(
            'button',
            {
              onclick: () => {
                const data = JSON.parse(JSON.stringify(cfg));
                if (!withKeys.v) {
                  for (const p of data.providers) p.apiKey = '';
                  data.anki.apiKey = '';
                }
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = h('a', { href: URL.createObjectURL(blob), download: `phrase-collector-config-${new Date().toISOString().slice(0, 10)}.json` });
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
              },
            },
            tr('导出配置 JSON')
          ),
          checkbox(withKeys, 'v', tr('包含 API Key'))
        )
      ),
      row(tr('导入'), h('div', { class: 'inline' }, h('button', { onclick: () => file.click() }, tr('导入配置 JSON')), file), helpHtml(tr('支持本插件导出的配置，也可导入 Read Frog 配置中的 customActions（追加为新动作）。'))),
      row(
        tr('重置'),
        h(
          'button',
          {
            class: 'danger',
            onclick: async () => {
              if (!(await confirmDialog(tr('恢复全部默认设置？'), tr('所有设置都会恢复默认，API Key 会保留。'), { ok: tr('恢复默认'), danger: true }))) return;
              const keys = new Map(cfg.providers.map((p) => [p.id, p.apiKey]));
              cfg = PC.defaultConfig();
              for (const p of cfg.providers) p.apiKey = keys.get(p.id) || '';
              save();
              renderAll();
            },
          },
          tr('恢复全部默认设置')
        )
      )
    )
  );
}

// =============================================================================
async function flushSave() {
  clearTimeout(saveTimer);
  lastSaved = JSON.stringify(cfg);
  await PC.saveConfig(cfg);
}

function renderAll() {
  PC.localize();
  applyTheme();
  renderWelcome();
  renderGeneral();
  renderProviders();
  renderActions();
  renderAnki();
  renderBackup();
}

chrome.storage.onChanged.addListener(async (changes) => {
  const nv = changes[PC.STORAGE_KEY]?.newValue;
  if (!nv || JSON.stringify(nv) === lastSaved) return;
  // 来自弹窗或划词面板的修改（如白名单、牌组）
  cfg = PC.normalizeConfig(nv);
  lastSaved = JSON.stringify(cfg);
  renderAll();
});

// 导航高亮当前所在分区
function initNav() {
  const links = [...document.querySelectorAll('.nav a')];
  const update = () => {
    const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
    let current = sections[0];
    for (const sec of sections) if (sec.getBoundingClientRect().top < window.innerHeight * 0.35) current = sec;
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1];
    links.forEach((a, i) => a.classList.toggle('active', sections[i] === current));
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

(async () => {
  cfg = await PC.loadConfig();
  lastSaved = JSON.stringify(cfg);
  if (cfg.actions[0]) openActions.add(cfg.actions[0].id);
  renderAll();
  initNav();
  loadAnkiLists(false);
})();
