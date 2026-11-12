// Phrase Collector 内容脚本：划词工具栏 + 结果面板（Shadow DOM 隔离样式）
(() => {
  if (window.top !== window || globalThis.__phraseCollectorLoaded) return;
  globalThis.__phraseCollectorLoaded = true;

  const tr = PC.t;
  const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
.pc{
  /* 与 Weekly Hub / Finance Butler 同一套配色 */
  --c1:#e6b8b5;--c2:#b8cbda;--c3:#d7cee7;--c4:#c0ccae;--c5:#a9cdc6;--c6:#ebc86c;
  --bg:#fffdfb;--bg-2:#f7f5f4;--fg:#30374b;--fg-2:#555b70;--muted:#8a8ea0;--line:#e7e4eb;--line-2:#f0eef2;
  --accent:#5d6a8f;--accent-soft:#eceef6;--accent-line:#cfd3e4;
  --btn:#68769b;--btn-hover:#515d82;--btn-fg:#ffffff;
  --ok:#4f7d68;--ok-soft:#e9f1ea;
  --mark:rgba(230,184,181,.6);--danger:#a64d59;--danger-soft:#f8eaeb;--danger-line:#efd2d5;
  --focus:#838cac;--ring:#a9a7cf;
  --serif:Georgia,"Noto Serif SC","Songti SC",serif;
  --shadow:0 22px 60px -18px rgba(45,48,79,.30),0 4px 14px -6px rgba(45,48,79,.10);
  font:14px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--fg);-webkit-font-smoothing:antialiased;
}
.pc[data-theme="lagoon"]{
  /* 与 Finance Butler 同一套湖光绿 */
  --c1:#82afa0;--c2:#b7c9a0;--c3:#ebc86c;--c4:#aacbdc;--c5:#e3c4ae;--c6:#a3bea7;
  --bg:#ffffff;--bg-2:#f7faf5;--fg:#314940;--fg-2:#587165;--muted:#7b9386;--line:#e0e8de;--line-2:#edf1ea;
  --accent:#416c58;--accent-soft:#edf5ed;--accent-line:#c9dccd;
  --btn:#608b77;--btn-hover:#477864;--btn-fg:#ffffff;
  --ok:#416c58;--ok-soft:#eff5ed;
  --mark:rgba(235,200,108,.45);--danger:#a0695b;--danger-soft:#f9f0e9;--danger-line:#ecd7c9;
  --focus:#91b8a1;--ring:#91b8a1;
  --shadow:0 22px 60px -18px rgba(48,78,64,.28),0 4px 14px -6px rgba(48,78,64,.10);
}
button{font:inherit;color:inherit;cursor:pointer;border:none;background:none;padding:0}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--ring);outline-offset:2px}
svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
kbd{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.3px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:3px 5px}

/* 划词工具栏 */
.toolbar{position:absolute;z-index:2147483647;display:flex;gap:2px;padding:4px;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);animation:pc-pop .16s ease-out}
.toolbar button{display:flex;align-items:center;gap:7px;height:32px;padding:0 10px;border-radius:10px;white-space:nowrap;font-size:13px;font-weight:550;color:var(--fg-2);transition:background .15s,color .15s}
.toolbar button:hover{background:var(--chip,var(--accent-soft));color:var(--fg)}
.toolbar .ic{display:grid;place-items:center;width:18px;height:18px;font-size:15px;line-height:1;color:var(--accent)}
.toolbar.lite button{width:34px;height:34px;padding:0;justify-content:center;border-radius:10px}
.toolbar.lite .label,.toolbar.lite kbd{display:none}
.toolbar.lite .ic{width:20px;height:20px;font-size:17px}
.pc-icon-svg{width:100%;height:100%;fill:none;stroke:currentColor}
.pc-icon-img{width:100%;height:100%;object-fit:contain;border-radius:4px}
.pc-icon-text{line-height:1}

/* 结果面板 */
.panel{position:fixed;z-index:2147483647;width:460px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:21px;box-shadow:var(--shadow);overflow:hidden;animation:pc-pop .2s ease-out}
.head{position:relative;display:flex;align-items:center;gap:12px;padding:15px 12px 14px 16px;border-bottom:1px solid var(--line-2);cursor:grab;user-select:none;background:linear-gradient(115deg,color-mix(in srgb,var(--c1) 24%,var(--bg)) 0%,color-mix(in srgb,var(--c3) 22%,var(--bg)) 55%,color-mix(in srgb,var(--c2) 26%,var(--bg)) 100%)}
.head:active{cursor:grabbing}
.badge .pc-icon-svg,.badge .pc-icon-img{width:20px;height:20px}
.badge{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:18px;line-height:1;color:var(--accent);background:var(--bg);box-shadow:0 2px 8px -2px rgba(45,48,79,.18);flex:none}
.titles{flex:1;min-width:0}
.sub{font-size:10px;line-height:1.5;letter-spacing:1.6px;font-weight:700;text-transform:uppercase;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.title{font:500 17px/1.3 var(--serif);letter-spacing:-.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tools{display:flex;gap:2px}
.tools button{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:var(--muted);transition:background .15s,color .15s}
.tools button:hover{background:color-mix(in srgb,var(--bg) 70%,transparent);color:var(--fg)}
.tools button.on{color:var(--accent);background:var(--accent-soft)}
.tools button.on svg{fill:currentColor}
.progress{position:absolute;left:0;right:0;bottom:-1px;height:2px;overflow:hidden;opacity:0;transition:opacity .25s}
.busy .progress{opacity:1}
.progress::after{content:"";position:absolute;inset:0;width:45%;background:linear-gradient(90deg,transparent,var(--c1),var(--c3),var(--c2),transparent);animation:pc-slide 1.5s ease-in-out infinite}

.sel{margin:14px 18px 0;padding:0 0 0 12px;font:italic 13px/1.6 var(--serif);color:var(--fg-2);border-left:2px solid var(--c1);max-height:calc(3.2em + 2px);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.sel[hidden]{display:none}

.body{padding:2px 20px 18px;overflow:auto;flex:1;min-height:72px;font-size:14.5px;line-height:1.8;color:var(--fg);overflow-wrap:anywhere;}
.body::-webkit-scrollbar,.combo-list::-webkit-scrollbar,.raw::-webkit-scrollbar{width:10px;height:10px}
.body::-webkit-scrollbar-track,.combo-list::-webkit-scrollbar-track,.raw::-webkit-scrollbar-track{background:transparent;margin:8px 0}
.body::-webkit-scrollbar-thumb,.combo-list::-webkit-scrollbar-thumb,.raw::-webkit-scrollbar-thumb{border:3px solid transparent;border-radius:10px;background:linear-gradient(180deg,color-mix(in srgb,var(--c1) 85%,var(--bg)),color-mix(in srgb,var(--c3) 85%,var(--bg)),color-mix(in srgb,var(--c2) 85%,var(--bg))) padding-box}
.body::-webkit-scrollbar-thumb:hover,.combo-list::-webkit-scrollbar-thumb:hover,.raw::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,var(--c1),var(--c3),var(--c2)) padding-box}
.body::-webkit-scrollbar-corner{background:transparent}
.body>:first-child{margin-top:14px}
.body h1,.body h2,.body h3{font:400 26px/1.25 var(--serif);letter-spacing:-.6px;margin:14px 0 4px;color:var(--fg)}
.body h3.long{font:400 17px/1.65 var(--serif);letter-spacing:-.1px}
.body p{margin:4px 0}
.body .label{display:flex;width:fit-content;align-items:center;gap:7px;margin:20px 0 6px;padding:3px 11px 3px 9px;border-radius:999px;background:color-mix(in srgb,var(--dot,var(--c2)) 30%,var(--bg));font-size:11px;line-height:1.5;letter-spacing:2px;font-weight:700;color:var(--fg-2)}
.body .label::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--dot,var(--c2));flex:none}
.body .label strong{font-weight:700}
.body b{font-weight:650;color:var(--fg)}
.body blockquote{margin:6px 0;padding:12px 16px;background:color-mix(in srgb,var(--c2) 14%,var(--bg));border:1px solid color-mix(in srgb,var(--c2) 38%,var(--bg));border-radius:14px;color:var(--fg-2);font:15px/1.75 var(--serif)}
.body blockquote+p{color:var(--fg-2);font-size:14px;margin-top:8px}
.body mark{background:linear-gradient(transparent 40%,var(--mark) 40%);color:var(--fg);padding:0 1px;border-radius:2px}
.body details{margin:20px 0 2px;border:1px solid color-mix(in srgb,var(--c3) 45%,var(--bg));border-radius:14px;overflow:hidden;background:color-mix(in srgb,var(--c3) 12%,var(--bg))}
.body summary{list-style:none;display:flex;align-items:center;gap:9px;cursor:pointer;padding:11px 15px;font-size:13px;font-weight:600;color:var(--fg-2);user-select:none;transition:background .15s,color .15s}
.body summary::-webkit-details-marker{display:none}
.body summary::before{content:"";width:6px;height:6px;border-right:1.8px solid currentColor;border-bottom:1.8px solid currentColor;transform:rotate(-45deg);transition:transform .2s;margin:0 2px}
.body summary:hover{background:color-mix(in srgb,var(--c3) 18%,var(--bg))}
.body details[open]>summary{color:var(--accent);border-bottom:1px solid color-mix(in srgb,var(--c3) 35%,var(--bg))}
.body details[open]>summary::before{transform:rotate(45deg)}
.body details>:not(summary){margin-left:16px;margin-right:16px}
.body details[open]>:last-child{margin-bottom:14px}
.body code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--bg-2);padding:1px 6px;border-radius:6px}
.body a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent-line)}
.body ul,.body ol{padding-left:20px;margin:6px 0}
.body .field{margin:14px 0}

.skeleton{padding:16px 0 4px}
.skeleton>i{display:block;height:10px;margin:0 0 11px;border-radius:999px;background:linear-gradient(90deg,var(--line-2) 0%,var(--line) 50%,var(--line-2) 100%);background-size:200% 100%;animation:pc-shimmer 1.4s linear infinite}
.skeleton>i:first-child{height:22px;width:48%;margin-bottom:18px;border-radius:8px}
.skeleton>i:nth-child(3){width:85%}
.skeleton>i:nth-child(4){width:62%}
.pending{display:flex;align-items:center;gap:9px;margin-top:14px;font-size:11px;letter-spacing:1.5px;font-weight:600;color:var(--muted)}
.dots{display:inline-flex;gap:4px}
.dots i{width:6px;height:6px;border-radius:50%;background:var(--c1);animation:pc-blink 1.2s infinite ease-in-out}
.dots i:nth-child(2){background:var(--c3);animation-delay:.15s}
.dots i:nth-child(3){background:var(--c2);animation-delay:.3s}

.err{display:flex;gap:10px;margin:14px 0 8px;padding:13px 15px;color:var(--danger);background:var(--danger-soft);border:1px solid var(--danger-line);border-radius:14px;font-size:13.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word}
.err svg{margin-top:3px}
.err-actions{display:flex;gap:8px;margin-top:9px}
.err-actions button{height:28px;padding:0 12px;border-radius:9px;font-size:12px;font-weight:650;color:var(--danger);background:var(--bg);border:1px solid var(--danger-line);transition:background .15s}
.err-actions button:hover{background:var(--danger-line)}
.raw{white-space:pre-wrap;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);background:var(--bg-2);padding:10px 14px;border-radius:12px;max-height:200px;overflow:auto;margin-top:8px}

.foot{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid var(--line-2);background:var(--bg-2)}
.deck{position:relative;flex:1;min-width:0;display:flex;align-items:center}
.deck>svg{position:absolute;left:12px;width:14px;height:14px;color:var(--muted);pointer-events:none}
.deck input{width:100%;height:38px;padding:0 38px 0 34px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg);font:inherit;font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
.deck input:hover{border-color:var(--accent-line)}
.deck input:focus{border-color:var(--focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 18%,transparent)}
.deck input:focus-visible{outline:none}
.combo-toggle{position:absolute;right:5px;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--muted);transition:background .15s,color .15s}
.combo-toggle:hover{background:var(--bg-2);color:var(--fg)}
.combo-toggle svg{width:14px;height:14px;transition:transform .2s}
.deck.open .combo-toggle svg{transform:rotate(180deg)}
.deck.open input{border-color:var(--focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--focus) 18%,transparent)}
.combo-list{position:absolute;z-index:5;left:0;right:0;bottom:calc(100% + 8px);max-height:220px;overflow:auto;padding:6px;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 16px 40px -12px rgba(45,48,79,.28)}
.combo-list[hidden]{display:none}
.combo-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 11px;border-radius:9px;font-size:13px;color:var(--fg-2);cursor:pointer;overflow-wrap:anywhere}
.combo-item:hover,.combo-item.active{background:var(--accent-soft);color:var(--fg)}
.combo-item.current{color:var(--accent);font-weight:650}
.combo-item.current::after{content:"✓";font-size:12px}
.combo-empty{padding:9px 11px;font-size:12.5px;color:var(--muted)}
.icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:var(--fg-2);border:1px solid var(--line);background:var(--bg);transition:color .15s,border-color .15s}
.icon:hover{color:var(--accent);border-color:var(--accent-line)}
.icon.on{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.add{display:flex;align-items:center;gap:6px;height:38px;padding:0 16px 0 13px;border-radius:12px;background:var(--btn);color:var(--btn-fg);font-weight:650;font-size:13px;letter-spacing:.3px;white-space:nowrap;transition:background .2s,opacity .15s,transform .15s}
.add:hover:not(:disabled){background:var(--btn-hover)}
.add:active:not(:disabled){transform:scale(.98)}
.add:disabled{opacity:.45;cursor:default}
.add.done{background:var(--ok-soft);color:var(--ok);opacity:1}
.add.loading svg{animation:pc-spin .8s linear infinite}

.status{display:flex;align-items:center;gap:6px;padding:0 16px 12px;background:var(--bg-2);font-size:12px;line-height:1.6;color:var(--muted)}
.status:empty{display:none}
.status svg{width:14px;height:14px}
.status.ok{color:var(--ok)}
.status.cache{color:var(--accent)}
.status.error{color:var(--danger);align-items:flex-start}
.status.error svg{margin-top:2px}
.status button{color:var(--accent);font-weight:650;font-size:12px;text-decoration:underline;text-underline-offset:3px;margin-left:2px}

@keyframes pc-pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes pc-spin{to{transform:rotate(360deg)}}
@keyframes pc-slide{from{transform:translateX(-100%)}to{transform:translateX(230%)}}
@keyframes pc-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes pc-blink{0%,80%,100%{opacity:.3;transform:scale(.75)}40%{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition:none!important}}
`;

  let cfg = null;
  let host = null;
  let root = null;
  let toolbar = null;
  let panel = null;
  let run = null; // 当前运行状态
  let deckCache = null;

  // ---------------------------------------------------------------------------
  // 配置
  // ---------------------------------------------------------------------------
  const active = () => cfg && PC.isSiteActive(cfg, location.href);
  const enabledActions = () => (cfg?.actions || []).filter((a) => a.enabled);

  PC.loadConfig().then((c) => (cfg = c));

  function applyLook(wrap) {
    if (!wrap) return;
    wrap.dataset.theme = PC.themeOf(cfg);
  }
  chrome.storage.onChanged.addListener(async (changes) => {
    if (!changes[PC.STORAGE_KEY]) return;
    cfg = await PC.loadConfig();
    applyLook(root?.querySelector('.pc'));
    if (!active()) hideToolbar();
  });

  // ---------------------------------------------------------------------------
  // DOM 基础
  // ---------------------------------------------------------------------------
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  function ensureRoot() {
    if (host?.isConnected) return;
    host = document.createElement('phrase-collector-ui');
    // 网页翻译插件会进入打开的 Shadow DOM 翻译里面的文字。Read Frog 只认 notranslate 类名，
    // 浏览器自带翻译认 translate="no"，两个都标上，划词面板就不会被翻译。
    host.className = 'notranslate';
    host.setAttribute('translate', 'no');
    host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLE);
      root.adoptedStyleSheets = [sheet];
    } catch {
      root.append(el('style', {}, STYLE));
    }
    const wrap = el('div', { class: 'pc notranslate', translate: 'no' });
    applyLook(wrap);
    root.append(wrap);
    document.documentElement.append(host);
  }

  const ICONS = {
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    speak: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    deck: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    dup: '<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M4 16V5.5A1.5 1.5 0 0 1 5.5 4H16"/><path d="M14.5 11.5v6M11.5 14.5h6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
  }

  const PALETTE = ['--c1', '--c2', '--c3']; // 与主题色条一致
  const chipStyle = (action) => {
    const i = Math.max(0, (cfg?.actions || []).findIndex((a) => a.id === action.id));
    return `--chip:color-mix(in srgb, var(${PALETTE[i % PALETTE.length]}) 38%, var(--bg))`;
  };

  // 插件被重新加载或更新后，已打开页面里的旧脚本不能再访问扩展接口（Extension context invalidated），
  // 所有扩展调用都经过这里：失效时不抛错，改为提示刷新页面
  const STALE = '插件已更新或重新加载，请刷新此页面后再使用。';
  function extAlive() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function send(msg, cb) {
    const fail = (error, stale) => cb?.({ ok: false, error, stale });
    if (!extAlive()) return fail(tr(STALE), true);
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) fail(err.message);
        else cb?.(res);
      });
    } catch {
      fail(tr(STALE), true);
    }
  }

  const container = () => root.querySelector('.pc');
  const isInside = (e) => !!host && e.composedPath().includes(host);

  function isEditable(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  // ---------------------------------------------------------------------------
  // 选区与上下文
  // ---------------------------------------------------------------------------
  // Read Frog 双语模式把译文插在原文段落里，取选中文字和上下文时要去掉，
  // 否则译文会混进发给 AI 的内容和 Anki 卡片。
  const TRANSLATION = '.read-frog-translated-content-wrapper';
  const SKIP_TEXT = `${TRANSLATION},script,style,noscript,template`;
  const BLOCK_TAGS = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|UL)$/;

  // 不含译文的文字，按块级元素换行，与 innerText 的效果接近
  function textWithoutTranslations(node) {
    const parts = [];
    const walk = (n) => {
      for (const child of n.childNodes) {
        if (child.nodeType === 3) parts.push(child.data);
        if (child.nodeType !== 1 || child.matches(SKIP_TEXT)) continue;
        if (child.tagName === 'BR') {
          parts.push('\n');
          continue;
        }
        const block = BLOCK_TAGS.test(child.tagName);
        if (block) parts.push('\n');
        walk(child);
        if (block) parts.push('\n');
      }
    };
    walk(node);
    return parts.join('').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // 元素的可读文字；含有 Read Frog 译文时去掉译文
  const readableText = (element) =>
    element?.querySelector?.(TRANSLATION) ? textWithoutTranslations(element) : (element?.innerText || element?.textContent || '');

  // 选中的文字；跨过译文时去掉译文，只选中了译文时保留原样
  function selectedText(sel) {
    const raw = sel.toString();
    if (!raw.trim() || !document.querySelector(TRANSLATION)) return raw;
    const fragment = sel.getRangeAt(0).cloneContents();
    if (!fragment.querySelector(TRANSLATION)) return raw;
    return textWithoutTranslations(fragment) || raw;
  }

  function selectionInfo() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const text = selectedText(sel).trim();
    if (!text) return null;
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const box = range.getBoundingClientRect();
    return { text, range, rect, box };
  }

  const BLOCK_SELECTOR = 'p,li,blockquote,dd,dt,td,th,pre,h1,h2,h3,h4,h5,h6,figcaption,[data-testid="tweetText"],article,section,div';

  function blockOf(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType !== 1) node = node.parentElement;
    return node?.closest(BLOCK_SELECTOR) || node;
  }

  // 划选处之前的一小段文字，用来在原句里认出划的是哪一处（同一个词可能出现多次）
  function textBefore(range) {
    const block = blockOf(range);
    if (!block) return '';
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const fragment = before.cloneContents();
    return (fragment.querySelector(TRANSLATION) ? textWithoutTranslations(fragment) : before.toString()).slice(-80);
  }

  function getParagraphs(range, text, limit) {
    const max = Math.min(Number(cfg?.general.maxContextChars) || 2000, limit || Infinity);
    const block = blockOf(range);
    let ctx = (readableText(block) || text).replace(/\n{3,}/g, '\n\n').trim();
    // 段落过短（如选中了行内元素）时向上扩展一层
    if (ctx.length < Math.min(text.length + 40, 200) && block?.parentElement && block.parentElement !== document.body) {
      const up = readableText(block.parentElement).trim();
      if (up.length <= max * 2) ctx = up;
    }
    if (ctx.length > max) {
      const idx = Math.max(0, ctx.indexOf(text));
      const start = Math.max(0, idx - Math.floor((max - text.length) / 2));
      ctx = (start > 0 ? '…' : '') + ctx.slice(start, start + max) + (start + max < ctx.length ? '…' : '');
    }
    return ctx || text;
  }

  function buildContext(info, action) {
    return {
      selection: info.text.slice(0, 5000),
      selectionBefore: textBefore(info.range),
      paragraphs: getParagraphs(info.range, info.text, action?.isLite ? PC.LITE_CONTEXT_CHARS : 0),
      webTitle: document.title,
      webUrl: location.href,
      // 设置里指定了原文语言时直接使用；否则先用网页声明的语言，识别结果出来后替换
      sourceLang: fixedSourceLang() || PC.normalizeLang(document.documentElement.lang),
    };
  }

  const fixedSourceLang = () => PC.langCode(cfg?.general.sourceLanguage);

  // 原文语言（用于朗读和 Anki 发音）：优先识别选中文字，太短识别不准时用所在段落
  async function detectSourceLang(context) {
    if (fixedSourceLang()) return '';
    for (const text of [context.selection, context.paragraphs]) {
      try {
        const res = await chrome.i18n.detectLanguage(text);
        const lang = res?.isReliable && PC.normalizeLang(res.languages?.[0]?.language);
        if (lang) return lang;
      } catch {
        // 扩展已失效或接口不可用时保留网页声明的语言
      }
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // 工具栏
  // ---------------------------------------------------------------------------
  function showToolbar(info) {
    const actions = enabledActions();
    if (!actions.length) return;
    ensureRoot();
    hideToolbar();
    toolbar = el(
      'div',
      { class: 'toolbar' + (cfg?.general.toolbarStyle === 'lite' ? ' lite' : ''), onmousedown: (e) => e.preventDefault() },
      actions.map((a) =>
        el(
          'button',
          {
            title: a.shortcut ? `${a.name}（${a.shortcut}）` : a.name,
            style: chipStyle(a),
            onclick: () => {
              const cur = selectionInfo() || info;
              hideToolbar();
              runAction(a, cur);
            },
          },
          el('span', { class: 'ic' }, PC.iconNode(a.icon)),
          el('span', { class: 'label' }, a.name),
          a.shortcut ? el('kbd', {}, a.shortcut) : null
        )
      )
    );
    container().append(toolbar);
    const r = info.rect;
    const w = toolbar.offsetWidth;
    const h = toolbar.offsetHeight;
    let left = r.right - w / 2;
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 4) top = info.box.top - h - 8;
    toolbar.style.left = left + window.scrollX + 'px';
    toolbar.style.top = top + window.scrollY + 'px';
  }

  function hideToolbar() {
    toolbar?.remove();
    toolbar = null;
  }

  // ---------------------------------------------------------------------------
  // 结果面板
  // ---------------------------------------------------------------------------
  function closePanel() {
    if (run) {
      clearInterval(run.ping);
      try {
        run.port?.disconnect();
      } catch {}
    }
    run = null;
    panel?.remove();
    panel = null;
  }

  function placePanel(p, info) {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(440, vw - 16);
    const r = info?.box;
    let left = r ? Math.min(Math.max(8, r.left), vw - w - 8) : vw - w - 16;
    p.style.left = left + 'px';
    if (!r) {
      p.style.top = '16px';
      p.style.maxHeight = vh - 32 + 'px';
      return;
    }
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    if (below >= 320) {
      p.style.top = r.bottom + 10 + 'px';
      p.style.maxHeight = below - 10 + 'px';
    } else if (above >= 320) {
      p.style.bottom = vh - r.top + 10 + 'px';
      p.style.maxHeight = above - 10 + 'px';
    } else {
      p.style.top = '12px';
      p.style.maxHeight = vh - 24 + 'px';
    }
  }

  function makeDraggable(p, handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      const rect = p.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      p.style.bottom = '';
      p.style.maxHeight = window.innerHeight - 24 + 'px';
      const move = (ev) => {
        p.style.left = Math.max(0, Math.min(ev.clientX - dx, window.innerWidth - 60)) + 'px';
        p.style.top = Math.max(0, Math.min(ev.clientY - dy, window.innerHeight - 40)) + 'px';
      };
      const up = () => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    });
  }

  function runAction(action, info, { fresh = false } = {}) {
    action = PC.effectiveAction(cfg, action); // 简版模式下换成简版提示词
    ensureRoot();
    closePanel();
    const context = buildContext(info, action);
    detectSourceLang(context).then((lang) => {
      if (lang) context.sourceLang = lang;
    });
    const ui = {};
    const provider = cfg?.providers.find((p) => p.id === action.providerId) || cfg?.providers[0];
    ui.pin = el('button', { title: tr('固定（点击页面其它位置不关闭）'), 'aria-pressed': 'false', onclick: () => ui.pin.setAttribute('aria-pressed', ui.pin.classList.toggle('on')) }, icon('pin'));
    ui.head = el(
      'div',
      { class: 'head' },
      el('span', { class: 'badge', style: chipStyle(action) }, PC.iconNode(action.icon)),
      el(
        'div',
        { class: 'titles' },
        el('div', { class: 'sub' }, provider ? [provider.name, provider.model].filter(Boolean).join(' · ') : 'Phrase Collector'),
        el('div', { class: 'title' }, action.isLite ? `${action.name} · ${tr('简版')}` : action.name)
      ),
      el(
        'div',
        { class: 'tools' },
        ui.pin,
        el('button', { title: tr('重新生成（不使用缓存）'), onclick: () => runAction(action, info, { fresh: true }) }, icon('refresh')),
        el('button', { title: tr('复制结果'), onclick: copyResult }, icon('copy')),
        el('button', { title: tr('关闭 (Esc)'), onclick: closePanel }, icon('close'))
      ),
      el('div', { class: 'progress' })
    );
    ui.body = el('div', { class: 'body' });
    ui.deck = el('input', { placeholder: tr('Anki 牌组'), title: tr('保存到的 Anki 牌组（修改后会记住）'), autocomplete: 'off' });
    ui.deck.value = action.anki.deck || '';
    ui.deck.addEventListener('change', () => send({ type: 'action:setDeck', actionId: action.id, deck: ui.deck.value }));
    ui.add = el('button', { class: 'add', disabled: '', onclick: () => addToAnki() });
    setAddButton(ui.add, 'plus', tr('添加到 Anki'));
    ui.speak = el('button', { class: 'icon', title: tr('朗读'), onclick: speak }, icon('speak'));
    ui.dup = el('button', { class: 'icon', onclick: () => setAllowDuplicate(!action.anki.allowDuplicate) }, icon('dup'));
    ui.status = el('div', { class: 'status', 'aria-live': 'polite' });
    panel = el(
      'div',
      { class: 'panel busy' },
      ui.head,
      (ui.sel = el('div', { class: 'sel', title: context.selection }, context.selection)),
      ui.body,
      el('div', { class: 'foot' }, deckPicker(ui.deck), ui.speak, ui.dup, ui.add),
      ui.status
    );
    container().append(panel);
    placePanel(panel, info);
    makeDraggable(panel, ui.head);
    loadDecks();

    run = { action, context, info, ui, text: '', values: null, done: false, thinking: false, added: false };
    const r = run;
    syncDupButton(r);
    renderBody(r);
    r.cacheKey = cfg?.general.cacheResults !== false ? PC.cacheKeyFor(cfg, action, context) : null;
    if (!r.cacheKey || fresh) return generate(r);
    PC.cacheGet(r.cacheKey)
      .catch(() => null)
      .then((hit) => {
        if (run !== r) return;
        if (!hit?.text) return generate(r);
        r.fromCache = hit;
        if (hit.noteId) {
          r.added = true;
          r.noteId = hit.noteId;
          verifyNote(r);
        }
        finish(r, hit.text);
      });
  }

  // 缓存里记着「已添加」，但卡片可能已在 Anki 中删除：确认笔记仍存在，否则恢复为未添加。
  // Anki 未打开等无法确认的情况保持原状
  function verifyNote(r) {
    const noteId = r.noteId;
    send({ type: 'anki:noteExists', noteId }, (res) => {
      if (!res?.ok || res.data !== false || run !== r || r.noteId !== noteId) return;
      r.added = false;
      r.noteId = null;
      if (r.cacheKey) PC.cachePut(r.cacheKey, { noteId: null, time: r.fromCache.time }).catch(() => {});
      refreshAddButton(r);
      if (r.done) showCacheNote(r);
    });
  }

  function generate(r) {
    const { action, context } = r;
    let port;
    try {
      if (!extAlive()) throw new Error();
      port = chrome.runtime.connect({ name: 'pc-ai' });
    } catch {
      r.stale = true;
      return fail(r, tr(STALE));
    }
    r.port = port;
    r.ping = setInterval(() => {
      try {
        port.postMessage({ type: 'ping' });
      } catch {}
    }, 20000);
    port.onMessage.addListener((msg) => {
      if (run !== r) return;
      if (msg.type === 'delta') {
        r.text += msg.text;
        scheduleRender(r);
      } else if (msg.type === 'thinking') {
        if (!r.thinking) {
          r.thinking = true;
          scheduleRender(r);
        }
      } else if (msg.type === 'done') finish(r, msg.text);
      else if (msg.type === 'error') fail(r, msg.message);
    });
    port.onDisconnect.addListener(() => {
      if (run === r && !r.done) fail(r, tr('与扩展后台的连接已断开，请重试（如刚更新过扩展，请刷新页面）'));
    });
    port.postMessage({ type: 'run', actionId: action.id, context });
  }

  // Anki 增删牌组时不会通知插件，所以每次打开面板或下拉列表都重新读取一次；
  // 读取期间先用上次的列表，读到的有变化再调用 onChange。Anki 没开时保留上次的列表。
  let decksLoading = false;
  function loadDecks(onChange) {
    decksLoading = true;
    send({ type: 'anki:decks' }, (res) => {
      decksLoading = false;
      const before = JSON.stringify(deckCache);
      if (res?.ok && Array.isArray(res.data)) deckCache = res.data;
      if (JSON.stringify(deckCache) !== before || !res?.ok) onChange?.();
    });
  }

  // 用新名字添加卡片时，后台会先在 Anki 里建好这个牌组，列表里也加上
  function rememberDeck(name) {
    if (!name || !deckCache || deckCache.includes(name)) return;
    deckCache = [...deckCache, name].sort((a, b) => a.localeCompare(b));
  }

  // 牌组下拉：点箭头列出全部牌组，输入时筛选（原生 datalist 在已有值时不显示列表，且无法定制样式）
  function deckPicker(input) {
    const list = el('div', { class: 'combo-list', role: 'listbox', hidden: '' });
    let active = -1;
    const close = () => {
      list.hidden = true;
      active = -1;
      wrap.classList.remove('open');
    };
    const pick = (v) => {
      input.value = v;
      input.dispatchEvent(new Event('change'));
      close();
    };
    let filtering = false;
    const emptyText = () =>
      deckCache ? tr('没有牌组，可直接输入新名称') : decksLoading ? tr('正在读取牌组…') : tr('未连接 Anki，可直接输入牌组名称');
    const open = (filter) => {
      filtering = filter;
      const q = filter ? input.value.trim().toLowerCase() : '';
      const decks = (deckCache || []).filter((d) => !q || d.toLowerCase().includes(q));
      if (filter && !decks.length) return close();
      active = -1;
      list.replaceChildren(
        ...(decks.length
          ? decks.map((d) => el('div', { class: 'combo-item' + (d === input.value ? ' current' : ''), role: 'option', onmousedown: (e) => (e.preventDefault(), pick(d)) }, d))
          : [el('div', { class: 'combo-empty' }, emptyText())])
      );
      list.hidden = false;
      wrap.classList.add('open');
      list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
    };
    const toggle = el(
      'button',
      {
        class: 'combo-toggle',
        title: tr('选择牌组'),
        tabindex: '-1',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => {
          if (!list.hidden) return close();
          input.focus();
          // 先显示上次的列表，读到 Anki 里的最新牌组后，列表还开着就更新
          open(false);
          loadDecks(() => {
            if (!list.hidden) open(filtering);
          });
        },
      },
      icon('chevron')
    );
    input.addEventListener('input', () => open(true));
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (e) => {
      const items = [...list.querySelectorAll('.combo-item')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) return open(false);
        if (!items.length) return;
        items[active]?.classList.remove('active');
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[active].classList.add('active');
        items[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (!list.hidden && active >= 0) pick(items[active].textContent);
        else input.dispatchEvent(new Event('change'));
        input.blur();
      } else if (e.key === 'Escape' && !list.hidden) {
        e.stopPropagation();
        close();
      }
    });
    const wrap = el('div', { class: 'deck' }, icon('deck'), input, toggle, list);
    return wrap;
  }

  function currentValues(r) {
    const parsed = PC.parsePartialJson(r.text) || {};
    const values = { ...parsed };
    for (const f of r.action.outputSchema) {
      if (f.fill && f.fill !== 'ai') values[f.name] = r.context[f.fill] ?? '';
    }
    return { values, hasAny: Object.keys(parsed).length > 0 };
  }

  function autoLayout(action) {
    return action.outputSchema
      .filter((f) => f.name && f.fill === 'ai')
      .map((f) => `{% if ${f.name} %}<div class="field"><div class="field-name">${PC.escapeHtml(f.name)}</div><div>{{ ${f.name} | newline_to_br }}</div></div>{% endif %}`)
      .join('\n');
  }

  let renderQueued = false;
  function scheduleRender(r) {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (run === r) renderBody(r);
    });
  }

  function renderBody(r) {
    const { body } = r.ui;
    if (r.error) {
      body.replaceChildren(
        el(
          'div',
          { class: 'err' },
          icon('alert'),
          el(
            'div',
            {},
            r.error,
            el(
              'div',
              { class: 'err-actions' },
              ...(r.stale
                ? [el('button', { onclick: () => location.reload() }, tr('刷新页面'))]
                : [
                    el('button', { onclick: () => runAction(r.action, r.info, { fresh: true }) }, tr('重试')),
                    el('button', { onclick: () => send({ type: 'open:options' }) }, tr('打开设置')),
                  ])
            )
          )
        ),
        ...(r.text ? [el('div', { class: 'raw' }, r.text)] : [])
      );
      return;
    }
    const { values, hasAny } = currentValues(r);
    const label = r.thinking && !r.text ? tr('模型思考中…') : tr('生成中…');
    const pending = () => el('div', { class: 'pending' }, el('span', { class: 'dots' }, el('i'), el('i'), el('i')), label);
    if (!hasAny) {
      body.replaceChildren(r.done ? el('div', { class: 'raw' }, r.text || tr('（空响应）')) : el('div', { class: 'skeleton' }, el('i'), el('i'), el('i'), el('i'), pending()));
      return;
    }
    const opened = [...body.querySelectorAll('details')].map((d) => d.open);
    const tpl = r.action.layout?.trim() ? r.action.layout : autoLayout(r.action);
    body.innerHTML = PC.renderTemplate(tpl, { ...r.context, ...values });
    body.querySelectorAll('details').forEach((d, i) => {
      if (opened[i]) d.open = true;
    });
    body.querySelectorAll('p:has(> strong:only-child), .field-name').forEach((p, i) => {
      p.classList.add('label');
      p.style.setProperty('--dot', `var(${PALETTE[i % PALETTE.length]})`);
    });
    const headings = body.querySelectorAll('h1,h2,h3');
    headings.forEach((h) => h.classList.toggle('long', h.textContent.trim().length > 60));
    // 结果标题与划选内容相同时，不再重复显示划选条
    const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
    r.ui.sel.hidden = !!headings[0] && norm(headings[0].textContent) === norm(r.context.selection);
    highlightTerm(body, values[r.action.anki.highlightTerm] || r.context.selection, r.context.selectionBefore);
    if (!r.done) body.append(pending());
  }

  // 在原句引用块中标出划选的那一处：按位置找，不会扩大到别处，也不会标出其他相同的词
  function highlightTerm(body, term, before) {
    const t = PC.valueToString(term).trim();
    if (t.length < 2 || t.length > 120) return;
    for (const quote of body.querySelectorAll('blockquote')) {
      const walker = document.createTreeWalker(quote, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let text = '';
      while (walker.nextNode()) {
        nodes.push([walker.currentNode, text.length]);
        text += walker.currentNode.nodeValue;
      }
      const hit = PC.findSelection(text, t, before);
      if (!hit) continue;
      const point = (pos, isEnd) => {
        for (const [node, base] of nodes) {
          const len = node.nodeValue.length;
          if (pos < base + len || (isEnd && pos === base + len)) return [node, pos - base];
        }
        const [node] = nodes[nodes.length - 1];
        return [node, node.nodeValue.length];
      };
      const range = document.createRange();
      range.setStart(...point(hit.start, false));
      range.setEnd(...point(hit.end, true));
      const mark = el('mark');
      mark.append(range.extractContents());
      range.insertNode(mark);
    }
  }

  function setAddButton(btn, iconName, label) {
    btn.replaceChildren(icon(iconName), label);
  }

  // 已添加过：允许重复时可再添加一张，否则显示「已添加」
  function refreshAddButton(r) {
    if (r.adding || !r.values) return;
    const again = r.added && r.action.anki.allowDuplicate;
    r.ui.add.classList.toggle('done', r.added && !again);
    r.ui.add.disabled = r.added && !again;
    if (!r.added) setAddButton(r.ui.add, 'plus', tr('添加到 Anki'));
    else setAddButton(r.ui.add, again ? 'plus' : 'check', again ? tr('再添加一张') : tr('已添加'));
  }

  function syncDupButton(r) {
    const on = !!r.action.anki.allowDuplicate;
    r.ui.dup.classList.toggle('on', on);
    r.ui.dup.setAttribute('aria-pressed', on);
    r.ui.dup.title = on ? tr('允许重复添加：已开启（点击关闭）') : tr('允许重复添加：已关闭（同一牌组首字段重复时拒绝，点击开启）');
  }

  // 面板中切换「允许重复添加」，按动作保存，与设置页同步
  function setAllowDuplicate(on) {
    const r = run;
    if (!r) return;
    r.action.anki.allowDuplicate = on;
    syncDupButton(r);
    refreshAddButton(r);
    send({ type: 'action:setDuplicate', actionId: r.action.id, allow: on });
  }

  function finish(r, text) {
    r.done = true;
    panel?.classList.remove('busy');
    r.text = text || r.text;
    clearInterval(r.ping);
    const { values, hasAny } = currentValues(r);
    r.values = values;
    if (!hasAny) {
      r.error = tr('未能从模型输出中解析出 JSON 结果。可尝试重新生成，或在 AI 服务中开启“JSON 模式”。');
    } else {
      refreshAddButton(r);
    }
    renderBody(r);
    if (!hasAny) return;
    if (r.fromCache) showCacheNote(r);
    else if (r.cacheKey) PC.cachePut(r.cacheKey, { text: r.text, noteId: null }).catch(() => {});
    if (r.action.autoAddToAnki) addToAnki();
  }

  // 缓存命中时的提示：多久之前生成（重新生成按钮在右上角）
  function showCacheNote(r) {
    const mins = Math.round((Date.now() - r.fromCache.time) / 60000);
    const ago =
      mins < 1
        ? tr('刚刚')
        : mins < 60
          ? tr('{n} 分钟前', { n: mins })
          : mins < 1440
            ? tr('{n} 小时前', { n: Math.round(mins / 60) })
            : tr('{n} 天前', { n: Math.round(mins / 1440) });
    if (!r.noteId) return setStatus(tr('已显示缓存结果（{ago}生成）', { ago }), 'cache');
    setStatus(tr('已显示缓存结果（{ago}生成，已添加到 Anki）', { ago }), 'cache', [
      ' · ',
      el('button', { onclick: () => send({ type: 'anki:browse', noteId: r.noteId }) }, tr('在 Anki 中查看')),
    ]);
  }

  function fail(r, message) {
    r.done = true;
    panel?.classList.remove('busy');
    r.error = message;
    clearInterval(r.ping);
    renderBody(r);
  }

  function setStatus(text, kind, extra) {
    if (!run) return;
    const s = run.ui.status;
    s.className = 'status' + (kind ? ' ' + kind : '');
    if (!text) return s.replaceChildren();
    let ic = kind === 'error' ? icon('alert') : kind === 'ok' ? icon('check') : null;
    if (kind === 'cache') ic = icon('history');
    s.replaceChildren(...[ic, el('span', {}, text, ...[].concat(extra || []))].filter(Boolean));
  }

  function addToAnki() {
    const r = run;
    if (!r?.values || r.adding || (r.added && !r.action.anki.allowDuplicate)) return;
    r.adding = true;
    r.ui.add.disabled = true;
    setAddButton(r.ui.add, 'loader', tr('添加中…'));
    r.ui.add.classList.remove('done');
    r.ui.add.classList.add('loading');
    setStatus('');
    send(
      { type: 'anki:add', actionId: r.action.id, values: r.values, context: r.context, deck: r.ui.deck.value, allowDuplicate: !!r.action.anki.allowDuplicate },
      (res) => {
        r.adding = false;
        if (run !== r) return;
        r.ui.add.classList.remove('loading');
        if (!res?.ok) {
          refreshAddButton(r);
          const msg = res?.error || tr('添加失败');
          // 重复被拒时直接给出「允许重复并添加」
          const extra = res?.duplicate && !r.action.anki.allowDuplicate
            ? [' · ', el('button', { onclick: () => (setAllowDuplicate(true), addToAnki()) }, tr('允许重复并添加'))]
            : null;
          setStatus(msg, 'error', extra);
          return;
        }
        r.added = true;
        r.noteId = res.data.noteId;
        rememberDeck(res.data.deckName);
        if (r.cacheKey) PC.cachePut(r.cacheKey, { text: r.text, noteId: res.data.noteId }).catch(() => {});
        refreshAddButton(r);
        setStatus(
          tr('已添加到「{deck}」', { deck: res.data.deckName }),
          'ok',
          el('button', { onclick: () => send({ type: 'anki:browse', noteId: res.data.noteId }) }, tr('在 Anki 中查看'))
        );
      }
    );
  }

  function speak() {
    if (!run) return;
    const field = run.action.anki.ttsField;
    const text = PC.valueToString((run.values || currentValues(run).values)[field]) || run.context.selection;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // 英语用设置里的口音（en_US / en_GB），其他语言按识别出的原文语言
    const lang = run.context.sourceLang;
    u.lang = (PC.isEnglishLang(lang) ? cfg?.anki.ttsLang || 'en_US' : PC.ankiTtsLang(lang)).replace('_', '-');
    u.rate = Number(cfg?.anki.ttsSpeed) || 1;
    speechSynthesis.speak(u);
  }

  async function copyResult() {
    if (!run) return;
    const { values } = currentValues(run);
    const text = run.action.outputSchema
      .map((f) => [f.name, PC.valueToString(values[f.name]).trim()])
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text || run.text);
      setStatus(tr('已复制到剪贴板'), 'ok');
    } catch {
      setStatus(tr('复制失败'), 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // 事件
  // ---------------------------------------------------------------------------
  document.addEventListener(
    'mousedown',
    (e) => {
      if (isInside(e)) return;
      if (e.clientX >= document.documentElement.clientWidth || e.clientY >= document.documentElement.clientHeight) return; // 点击滚动条
      hideToolbar();
      if (panel && !run?.ui.pin.classList.contains('on')) closePanel();
    },
    true
  );

  document.addEventListener(
    'mouseup',
    (e) => {
      if (isInside(e) || e.button !== 0) return;
      setTimeout(() => {
        if (!active() || cfg.general.toolbarTrigger !== 'auto') return;
        const info = selectionInfo();
        if (info && info.text.length <= 5000) showToolbar(info);
      }, 10);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        if (root?.querySelector('.deck.open')) return; // 先由牌组下拉自己关闭
        if (toolbar) hideToolbar();
        else if (panel) closePanel();
        return;
      }
      if (isInside(e) || isEditable(e.target) || !active()) return;
      const combo = PC.comboFromEvent(e);
      if (!combo) return;
      const action = enabledActions().find((a) => a.shortcut && PC.normalizeCombo(a.shortcut) === combo);
      if (!action) return;
      const info = selectionInfo();
      if (!info) return;
      e.preventDefault();
      e.stopPropagation();
      hideToolbar();
      runAction(action, info);
    },
    true
  );

  document.addEventListener('selectionchange', () => {
    if (toolbar && !window.getSelection()?.toString().trim()) hideToolbar();
  });
})();
