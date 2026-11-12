<p align="center">
  <img src="icons/icon.svg" width="88" alt="Phrase Collector">
</p>

<h1 align="center">Phrase Collector</h1>

<p align="center">
  划词即解析，一键存进 Anki。<br>
  Select a phrase, let AI explain it in context, and turn it into an Anki card in one click.
</p>

<p align="center">
  <a href="#中文">中文</a> · <a href="#english">English</a>
</p>

<p align="center">
  <img src="docs/screenshots/panel-dusk.png" width="380" alt="划词面板 · 暮光主题 / Result panel · Dusk theme">
  &nbsp;
  <img src="docs/screenshots/panel-lagoon.png" width="380" alt="划词面板 · 湖光主题 / Result panel · Lagoon theme">
</p>

---

## 中文

Phrase Collector 是给读外语材料的人用的 Chrome 扩展。在网页上选中一个表达或长句（任何语言），它会连同所在段落发给你自己配置的 AI，按语境给出解析，再一键做成带发音的 Anki 卡片。

没有服务端，API Key 只存在本机，请求直接发往你填写的接口。

### 功能

- **自带 Key 的 AI**：任意 OpenAI 兼容接口（DeepSeek、OpenAI、Ollama 等），以及 Claude 和 Gemini。流式输出，支持推理模型。
- **两个内置动作**：💬 Phrase in Context（`Alt+Z`）解析表达在语境中的含义和用法；🧩 Sentence Decode（`Shift+Z`）拆解长难句。也可以自定义动作的提示词、输出字段、面板布局、快捷键和牌组。
- **一键制卡**：自动创建和维护 Anki 笔记类型，也可以映射到你已有的类型。划选的原文、网页标题和链接由插件直接填写，不经 AI。
- **发音**：Anki 内置 TTS，或有道 / Google 在线音频；按原文语言自动切换。
- **简版模式**：只输出译文和语境释义，花费约为完整版的三分之一，可在工具栏弹窗随时切换。
- **结果缓存**：同一段落再次划选同一内容时直接显示上次的结果，不耗 Token。
- **多语言**：解释语言可任选，内置提示词和卡片标签随之切换；界面支持中文和 English。
- **其他**：网站白名单，两套主题（同时作用于卡片），配置备份，可导入 Read Frog 的自定义动作。

### 安装

1. 下载本仓库并解压。
2. 打开 `chrome://extensions`，开启"开发者模式"，点"加载已解压的扩展程序"，选择含 `manifest.json` 的文件夹。Edge、Brave 等 Chromium 浏览器同样可用。

### 快速开始

1. **AI 服务**：在设置页填写 API Key（默认 DeepSeek），点「测试连接」，再点「获取模型列表」选模型。
2. **Anki**：安装 [AnkiConnect](https://ankiweb.net/shared/info/2055492159)（插件代码 `2055492159`）并重启 Anki，在「Anki 与发音」点「测试连接」，在 Anki 弹窗中点 **Yes**。
3. **白名单**：在要读的网站上点工具栏图标 →「加入白名单」并允许访问。图标显示 `ON` 即生效。

之后选中文字，点浮出的按钮或按快捷键，在结果面板底部选好牌组，点「添加到 Anki」。

<p align="center"><img src="docs/screenshots/toolbar.png" width="560" alt="划词工具栏"></p>

<p align="center"><img src="docs/screenshots/settings-dusk.png" width="820" alt="设置页"></p>

### 隐私

- API Key 和设置只存在浏览器本地（`chrome.storage.local`）。
- 划词内容只发给你配置的 AI 接口；开启在线音频时，发音文本会发给有道或 Google。
- 划词脚本只在你授权的白名单网站上运行。

### 常见问题

- **划词没反应**：点工具栏图标确认网站已加入白名单并已授权，仍不行就刷新页面。Chrome 的 PDF 阅读器、`chrome://` 页面和应用商店页面无法运行扩展脚本。
- **HTTP 400，提到 `response_format`**：该服务不支持 JSON 模式，在「AI 服务」里关掉「JSON 模式」。
- **「模型思考中…」等得久**：在「AI 服务」里把「思考」设为「关闭」；不支持这个开关的模型报 400 时，改为「服务默认」。
- **Ollama**：用 `OLLAMA_ORIGINS=chrome-extension://*` 启动，API Key 留空。在别的电脑上时，那台电脑还要设 `OLLAMA_HOST=0.0.0.0`，Base URL 改成它的地址（如 `http://192.168.1.20:11434/v1`）。
- **连不上 AnkiConnect**：保持 Anki 打开；AnkiConnect 设了 apiKey 时，插件里要填同样的 Key。
- **卡片已存在**：同一牌组首字段重复时默认拒绝，点面板底部「允许重复添加」即可。
- **开着 Read Frog**：双语模式下译文不会混进划词内容；只显示译文的模式下拿到的是译文，请切回双语模式。

<details>
<summary>提示词变量、白名单规则、默认笔记类型</summary>

**提示词变量**：`{{selection}}` 选中文本，`{{paragraphs}}` 所在段落，`{{webTitle}}`、`{{webUrl}}` 网页标题和链接，`{{sourceLanguage}}` 原文语言（自动识别时为空），`{{targetLanguage}}` 解释语言。输出字段的 JSON 格式要求会自动追加到 System Prompt。

**白名单规则**（每行一条，`#` 开头为注释）：

| 写法 | 匹配 |
| --- | --- |
| `*.example.com` 或 `example.com` | 该域名及全部子域名 |
| `https://x.com/*/status/*` | 带通配符的完整网址 |
| `/regex/` | 正则表达式匹配完整网址 |

**默认笔记类型**：

| 动作 | 笔记类型 | 字段 |
| --- | --- | --- |
| Phrase in Context | `Phrase Collector · Phrase` | Expression, MeaningZH, ContextEN, ContextZH, NuanceZH, PatternEN, SourceTitle, SourceURL, Audio |
| Sentence Decode | `Phrase Collector · Sentence` | SentenceEN, SentenceZH, Core, Chunks, LogicZH, HardPartZH, Takeaways, SourceURL, Audio |

卡片模板在「划词动作 → Anki 卡片 → 卡片模板（高级）」中修改，`[[TTS]]` 是发音占位符。插件管理的笔记类型以插件中的模板为准，改了发音设置后点「同步模板到 Anki」。

</details>

<details>
<summary>项目结构</summary>

纯原生 JavaScript，无需构建，无第三方依赖。改完代码后在 `chrome://extensions` 点刷新，再刷新网页。

```
background.js              AI 流式请求、AnkiConnect、在线音频、笔记类型同步、注册划词脚本
content/content.js         划词工具栏与结果面板（Shadow DOM）
options/  popup/           设置页、工具栏弹窗
shared/core.js             默认配置、主题、Liquid 模板引擎、JSON 解析、白名单匹配
shared/i18n.js             界面英文对照
shared/default-prompts.js  内置动作的提示词
```

</details>

### 致谢

划词动作的设计参考了 [Read Frog](https://github.com/mengxi-ream/read-frog)，制卡流程参考了 [ODH](https://github.com/ninja33/ODH)，卡片通过 [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect) 写入。

---

## English

Phrase Collector is a Chrome extension for people reading in a foreign language. Select an expression or a long sentence in any language; it goes, with its paragraph, to the AI provider you configure, and the explanation in context becomes an Anki card with audio in one click.

No backend: your API key stays in your browser, and requests go straight to the endpoint you set.

### Features

- **Bring your own key**: any OpenAI-compatible API (DeepSeek, OpenAI, Ollama…), plus Claude and Gemini. Streaming output; reasoning models supported.
- **Two built-in actions**: 💬 Phrase in Context (`Alt+Z`) explains an expression's meaning and use in context; 🧩 Sentence Decode (`Shift+Z`) breaks down a long sentence. Write your own actions with their own prompts, output fields, panel layout, shortcut and deck.
- **One-click cards**: note types are created and maintained for you, or mapped onto your own. The selected text, page title and URL are filled in by the extension, never by the AI.
- **Audio**: Anki's built-in TTS, or Youdao / Google audio, following the language of the selection.
- **Lite mode**: just the translation and the meaning in context, at about a third of the cost; switch from the toolbar popup.
- **Result cache**: selecting the same text in the same paragraph again shows the last result without using tokens.
- **Languages**: explanations in any language you choose, with built-in prompts and card labels to match; English and Chinese interfaces.
- **Also**: site whitelist, two themes (cards included), settings backup, and import of Read Frog custom actions.

### Installation

1. Download this repository and unzip it.
2. Open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose the folder with `manifest.json`. Edge, Brave and other Chromium browsers work the same way.

### Quick start

1. **AI provider**: on the settings page, paste your API key (DeepSeek by default), click *Test connection*, then *Fetch models* to pick a model.
2. **Anki**: install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) (add-on code `2055492159`) and restart Anki. Under *Anki & audio*, click *Test connection* and choose **Yes** in Anki's dialog.
3. **Whitelist**: on a site you read, click the toolbar icon → *Add to whitelist* and allow access. An `ON` badge means it's active.

Then select text, click an action button or press its shortcut, choose a deck at the bottom of the panel, and click *Add to Anki*.

<p align="center"><img src="docs/screenshots/settings-lagoon.png" width="820" alt="Settings page · Lagoon theme"></p>

### Privacy

- API keys and settings stay in your browser (`chrome.storage.local`).
- Selected text goes only to the AI endpoint you configure; with online audio on, the text to speak goes to Youdao or Google.
- The selection script runs only on whitelisted sites you've granted access to.

### Troubleshooting

- **Nothing happens on selection**: check from the toolbar icon that the site is whitelisted and granted, then reload the page. Chrome's PDF viewer, `chrome://` pages and the Web Store can't run extension scripts.
- **HTTP 400 mentioning `response_format`**: the provider doesn't support JSON mode; turn off *JSON mode* for it.
- **Long "thinking" waits**: set *Thinking* to *Off* under *AI providers*; if a model returns 400 for that, choose *Provider default*.
- **Ollama**: start it with `OLLAMA_ORIGINS=chrome-extension://*` and leave the API key empty. On another computer, also start it with `OLLAMA_HOST=0.0.0.0` and set the Base URL to that machine (e.g. `http://192.168.1.20:11434/v1`).
- **Can't reach AnkiConnect**: keep Anki open; if AnkiConnect has an apiKey, enter the same key in the extension.
- **"Card already exists"**: duplicates in a deck are rejected by default; turn on *Allow duplicates* in the panel footer.
- **Read Frog**: in bilingual mode its translations stay out of the selection; in translation-only mode the selection is the translation, so switch back to bilingual.

<details>
<summary>Prompt variables, whitelist rules, default note types</summary>

**Prompt variables**: `{{selection}}`, `{{paragraphs}}`, `{{webTitle}}`, `{{webUrl}}`, `{{sourceLanguage}}` (empty when auto-detected), `{{targetLanguage}}` (the explanation language). JSON instructions for your output fields are appended to the system prompt automatically.

**Whitelist rules** (one per line; `#` starts a comment):

| Rule | Matches |
| --- | --- |
| `*.example.com` or `example.com` | the domain and all subdomains |
| `https://x.com/*/status/*` | full URL, with wildcards |
| `/regex/` | full URL, as a regular expression |

**Default note types**:

| Action | Note type | Fields |
| --- | --- | --- |
| Phrase in Context | `Phrase Collector · Phrase` | Expression, MeaningZH, ContextEN, ContextZH, NuanceZH, PatternEN, SourceTitle, SourceURL, Audio |
| Sentence Decode | `Phrase Collector · Sentence` | SentenceEN, SentenceZH, Core, Chunks, LogicZH, HardPartZH, Takeaways, SourceURL, Audio |

Card templates are editable in each action's advanced card template settings; `[[TTS]]` is the audio placeholder. For note types the extension manages, its templates win over edits in Anki; after changing audio settings, click *Sync templates to Anki*.

</details>

<details>
<summary>Project structure</summary>

Plain JavaScript, no build step, no third-party dependencies. After editing, reload the extension in `chrome://extensions`, then reload the page.

```
background.js              AI streaming, AnkiConnect, online audio, note type sync, registering the selection script
content/content.js         Selection toolbar and result panel (Shadow DOM)
options/  popup/           Settings page and toolbar popup
shared/core.js             Defaults, themes, Liquid template engine, JSON parsing, whitelist matching
shared/i18n.js             English UI strings
shared/default-prompts.js  Prompts for the built-in actions
```

</details>

### Acknowledgements

The selection actions are inspired by [Read Frog](https://github.com/mengxi-ream/read-frog), the card-making flow by [ODH](https://github.com/ninja33/ODH), and cards are written through [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect).
