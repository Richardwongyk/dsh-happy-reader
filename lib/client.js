// dsh-happy-reader（Happy Reader）—— 浏览器半边
//
// 九项功能：
//   ① 隐藏输入框（开关；隐藏形式在底部"设置"里二选一：收缩＝底部浮动细线，悬停/点击
//      平滑展开、不挤压正文；完全隐藏）
//   ② 隐藏上边栏（会话标题栏；最上方的系统窗口标题条是系统窗口控制区，未触碰）
//   ③ 字号 10–40px（10–22 与官方设置直连，超出部分用缩放层补齐）
//   ④ 内容宽度（官方范围内与官方手柄同键同步；超出官方钳制上限时扩展，拖手柄即交还）
//   ⑤ 字体选择（正文字体·中文/西文分设 + 代码字体，只列出本机已装字体）
//   ⑥ 全屏（网页全屏 API；Esc 或再点开关退出，状态与真实全屏双向同步）
//   ⑦ 行距 / 字距（面板最下方；1.0× / 0px 即官方原样）
//   ⑧ 面板可拖动 / 可拉拽高度（双击标题栏复位为自动布局；位置与高度都会记住）
//   ⑨ 复制为 Markdown（选中消息内容复制时，公式还原为 LaTeX 源码、代码转围栏等）
//
// 设计要点（细节见各段代码注释）：
//   · 输入框收起一律用几何/浮层收缩而非 display:none —— 官方滚动锚定依赖该元素的几何
//     （隐藏态 height:0；收缩态为 fixed 浮动细线：max-height 收敛 + 内容淡出，展开不挤压正文）
//   · <style> 的 disabled 一律在挂载后设置（未挂入文档时设置会被静默丢弃，CSSOM 行为）
//   · 中英分字用 @font-face(local()+unicode-range) 按区间硬分区；三处字体全"默认"时覆盖层整表停用
//   · 字体覆盖层依赖官方主题排印 token，主题可能稍后才就绪 → 轻量定时器稍后补建
//   · 热重载：DSH 监视插件文件变化会再次执行本客户端，重建前须先拆旧实例（见 apply 开头）
//   · 选区复制（功能⑨）：公式还原读 KaTeX 的 annotation 源码出口（与官方 copy-tex 同源）；
//     标签→Markdown 映射由 vendored turndown + 官方 gfm 插件承担（均 MIT，逐字内联于文件尾）
//
// 本文件采用官方客户端插件包格式：外壳加载时全局 __ModuleLoader__ 已就绪，
// 登记 { id: 包名, factory }；factory 在插件挂载时执行，导出的 apply 即插件本体。
window.__ModuleLoader__.load({
  id: 'dsh-happy-reader',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // ── 常量 ────────────────────────────────────────────────────────────
    const VERSION = '0.2.2'
    const STATE_KEY = 'dsh.reader-boost.v1'
    const FAB_ID = 'dsrb-fab'
    const PANEL_ID = 'dsrb-panel'
    const STYLE_ID = 'dsrb-style'
    const HIDE_STYLE_ID = 'dsrb-hide-composer'
    const MINI_STYLE_ID = 'dsrb-mini-composer'
    const HIDE_TOP_STYLE_ID = 'dsrb-hide-top'
    const FONT_STYLE_ID = 'dsrb-font-scale'
    const FONT_PICK_STYLE_ID = 'dsrb-font-pick'
    const FS_STYLE_ID = 'dsrb-fullscreen'
    const FAB_SIZE = 40
    const PANEL_WIDTH = 280
    const PANEL_MAX_H = 480 // 面板高度锁：新增选项不再增高面板，超出部分由内部滚动查看
    const PANEL_MIN_H = 180 // 面板拉拽高度的下限
    const BORDER_Y = 2 // 面板上下边框各 1px（外框高 = 内容高 + 2，定位预算统一用它）

    // 官方宽度机制的同一套约定（对照 dsh-client-ui-conversation # ConversationWidthControls）
    const WIDTH_PREF_KEY = 'dsh.conversation.contentWidth'
    const CONTENT_MIN = 640
    const CONTENT_EDGE_BUDGET = 176

    // 官方字号范围（theme.setFontSize 只接受 10–22 的整数，超出部分由缩放层补齐）
    const FONT_MIN = 10
    const FONT_MAX = 40
    const FONT_OFFICIAL_MAX = 22

    // 行距倍率与字距范围（0.1 步进；边界值 = 完全还原官方排版）
    const LINEH_MIN = 1
    const LINEH_MAX = 2.2
    const LETTERSP_MIN = -1
    const LETTERSP_MAX = 3

    // 官方字号变量（dsh-client-ui-theme 提供、ui-layout 写入 body 内联样式）
    const CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'

    // ── 样式 ────────────────────────────────────────────────────────────
    const CSS = `
.dsrb-fab{position:fixed;z-index:9999;width:40px;height:40px;border-radius:12px;
  border:1px solid rgba(128,128,128,.35);background:rgba(28,28,30,.85);color:#f5f5f5;
  font:600 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;
  justify-content:center;cursor:grab;user-select:none;-webkit-user-select:none;
  box-shadow:0 4px 14px rgba(0,0,0,.28);backdrop-filter:blur(6px)}
.dsrb-fab:active{cursor:grabbing}
.dsrb-panel{position:fixed;z-index:9999;width:${PANEL_WIDTH}px;padding:0 14px;border-radius:12px;
  max-height:calc(100vh - 18px);display:flex;flex-direction:column;overflow:hidden;
  border:1px solid rgba(128,128,128,.3);background:rgba(28,28,30,.96);color:#ececec;
  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
  box-shadow:0 8px 28px rgba(0,0,0,.38);backdrop-filter:blur(8px)}
.dsrb-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 0}
.dsrb-body::-webkit-scrollbar{width:8px}
.dsrb-body::-webkit-scrollbar-thumb{background:rgba(128,128,128,0);border-radius:4px;transition:background .15s}
.dsrb-body:hover::-webkit-scrollbar-thumb{background:rgba(128,128,128,.45)}
.dsrb-body:hover::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.65)}
.dsrb-body::-webkit-scrollbar-track{background:transparent}
.dsrb-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 4px;cursor:grab}
.dsrb-head:active{cursor:grabbing}
.dsrb-resize{flex:none;height:10px;cursor:ns-resize;border-radius:0 0 12px 12px}
.dsrb-resize-top{flex:none;height:10px;cursor:ns-resize;border-radius:12px 12px 0 0}
.dsrb-resize:hover,.dsrb-resize-top:hover{background:rgba(255,255,255,.07)}
.dsrb-head h4{margin:0;font-size:13px;font-weight:600}
.dsrb-headHint{font-size:11.5px;color:#8d8d8d;margin-left:auto;margin-right:8px;white-space:nowrap}
.dsrb-x{width:22px;height:22px;padding:0;border-radius:6px;border:1px solid rgba(128,128,128,.3);
  background:rgba(255,255,255,.06);color:#ddd;font-size:13px;line-height:1;cursor:pointer}
.dsrb-x:hover{background:rgba(255,255,255,.16)}
.dsrb-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;
  border-top:1px solid rgba(128,128,128,.14)}
.dsrb-head+.dsrb-row{border-top:0}
.dsrb-row-click{cursor:pointer}
.dsrb-row-click:hover{background:rgba(255,255,255,.045)}
.dsrb-rowMain{flex:1;min-width:0}
.dsrb-rowTitle{font-weight:600}
.dsrb-rowTitle b{color:#fff;font-weight:600}
.dsrb-rowSub{color:#9a9a9a;font-size:12px;margin-top:2px}
.dsrb-switch{position:relative;flex:none;width:34px;height:20px;margin-top:1px;cursor:pointer}
.dsrb-switch input{position:absolute;inset:0;opacity:0;margin:0;pointer-events:none}
.dsrb-switch span{position:absolute;inset:0;border-radius:10px;background:rgba(120,120,120,.35);
  transition:background .15s;pointer-events:none}
.dsrb-switch span:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;
  border-radius:50%;background:#fff;transition:transform .15s}
.dsrb-switch input:checked+span{background:#2f7af0}
.dsrb-switch input:checked+span:after{transform:translateX(14px)}
.dsrb-stepper{flex:none;display:flex;gap:6px;align-items:center}
.dsrb-stepper button{width:28px;height:28px;border-radius:8px;border:1px solid rgba(128,128,128,.3);
  background:rgba(255,255,255,.06);color:#eee;font-size:14px;line-height:1;cursor:pointer}
.dsrb-stepper button:hover{background:rgba(255,255,255,.14)}
.dsrb-stepper button:disabled{opacity:.45;cursor:default}
.dsrb-seg{flex:none;display:flex;border:1px solid rgba(128,128,128,.3);border-radius:8px;
  overflow:hidden;margin-top:1px}
.dsrb-seg button{height:26px;padding:0 10px;border:0;background:transparent;color:#ccc;
  font-size:12px;cursor:pointer}
.dsrb-seg button+button{border-left:1px solid rgba(128,128,128,.25)}
.dsrb-seg button:hover{background:rgba(255,255,255,.12)}
.dsrb-seg button.on{background:#2f7af0;color:#fff}
.dsrb-seg button.on:hover{background:#2f7af0}
.dsrb-setHead{align-items:center}
.dsrb-chev{margin-left:auto;color:#9a9a9a;font-size:11px}
.dsrb-setBody{margin-left:10px}
.dsrb-setBody .dsrb-row{border-top:0}
.dsrb-widthRow{display:flex;align-items:center;gap:8px;margin-top:7px}
.dsrb-widthRow input[type=range]{flex:1;min-width:0}
.dsrb-widthRow button{flex:none;height:24px;padding:0 10px;border-radius:8px;
  border:1px solid rgba(128,128,128,.3);background:rgba(255,255,255,.06);color:#eee;
  font-size:12px;cursor:pointer}
.dsrb-widthRow button:hover{background:rgba(255,255,255,.14)}
.dsrb-widthRow button:disabled{opacity:.45;cursor:default}
.dsrb-select{width:100%;margin-top:7px;height:26px;padding:0 6px;border-radius:8px;
  border:1px solid rgba(128,128,128,.3);background:rgba(255,255,255,.06);color:#eee;
  font-size:12px;cursor:pointer}
.dsrb-select:focus{outline:none;border-color:#2f7af0}
.dsrb-select option{background:#1c1c1e;color:#eee}
.dsrb-pair{display:flex;gap:8px;margin-top:7px}
.dsrb-pairCol{flex:1;min-width:0}
.dsrb-mini{font-size:11px;color:#9a9a9a;margin-bottom:3px}
.dsrb-pairCol .dsrb-select{margin-top:0}
`
    // 隐藏输入框（完整收起：height:0——官方滚动锚定依赖该元素的几何信息）
    const HIDE_CSS = '[data-composer-seat]{height:0!important;min-height:0!important;overflow:hidden!important}'
    // 迷你输入框（收起态·"浮动细线"）：
    //   · 常驻：fixed 浮于视口底部（左右/底均留空隙，不贴边），展开上限 70vh；
    //   · 收起（未悬停未聚焦）：压成 6px 细线 + 自绘线条底色 + 内容淡出并退出命中
    //     测试（防误点被隐藏的内容，滚轮也穿透给正文）；点击细线由捕获阶段聚焦输入元素；
    //   · 展开（悬停/聚焦）：只放开 max-height——颜色、内容与命中全部交还官方样式；
    //     且因脱离文档流，"展开"是浮层上移而非挤压正文（滚动与阅读位置零跳动）。
    const MINI_CSS = [
      '[data-composer-seat]{position:fixed!important;left:16px;right:16px;bottom:10px;z-index:60;' +
        'min-height:0!important;max-height:70vh!important;overflow:hidden!important;transition:max-height .18s ease}',
      '[data-composer-seat]>*{transition:opacity .12s ease}',
      '[data-composer-seat]:not(:hover):not(:focus-within){max-height:6px!important;cursor:pointer;' +
        'background:rgba(128,128,128,.35)!important;border-radius:8px!important}',
      '[data-composer-seat]:not(:hover):not(:focus-within)>*{opacity:0!important;pointer-events:none!important}',
    ].join('')
    // 隐藏上边栏（会话标题栏）—— 排除对话框内的头部：嵌入页覆盖层（如"查询用量"）的
    // 头部承载它唯一的返回按钮（button.back），一并隐藏会把用户锁在页面里回不去
    const HIDE_TOP_CSS = 'header[data-window-drag]:not([role="dialog"] *){display:none!important}'
    // 字号缩放层（!important 样式表仅在需要缩放时启用；官方内联值原样保留在其下）
    const FONT_CSS = `body{--dsh-content-font-size:calc(var(--dsrb-font-base,14px)*var(--dsrb-font-scale,1))!important}`
    // 全屏补偿层：不归零官方定位变量 —— --dsh-windows-titlebar-height（=40px）是
    // "开合/新对话"悬浮按钮与"应用/编辑"菜单的定位基准，归零会裁掉它们的上半截。
    // 改为逐项覆盖：frame 顶部预留条清零、侧栏列自留该变量、收态归零内容圆角、
    // 全屏隐藏菜单；规则由 html[data-dsrb-fullscreen] 门控，退出全屏即完全还原。
    const FS_CSS = [
      // 镜像官方 html[data-windows-titlebar][data-fullscreen]：overlay 顶距 20px、chrome 顶距 0
      'html[data-windows-titlebar][data-dsrb-fullscreen]{--dsh-frame-overlay-top:20px;--dsh-frame-chrome-top:0px}',
      // frame 的 40px 预留条清零 → 两侧列内容顶到屏幕最上缘
      'html[data-dsrb-fullscreen] .BynINW_frame{padding-top:0!important}',
      'html[data-dsrb-fullscreen] .BynINW_frame::before{height:0!important}',
      // 收起态：内容列左上圆角归零（收起时圆角在 (0,0) 露出 frame 底色成为缺口）
      'html[data-dsrb-fullscreen]:has([data-sidebar-collapsed=true]) .BynINW_centerCol{border-radius:0!important}',
      // 展开态：侧栏列自留 40px 顶部，悬浮按钮下方内容位置与窗口态保持一致
      'html[data-dsrb-fullscreen] .BynINW_sidebarCol{padding-top:var(--dsh-windows-titlebar-height)}',
      // 侧栏拖拽手柄随之顶到 0（其 top 同样以 var 为基准）
      'html[data-dsrb-fullscreen] .BynINW_handle{top:0!important}',
      // 全屏隐藏 preload"应用/编辑"菜单（退出全屏即恢复；无键盘通道，不影响 Esc 退出）
      'html[data-dsrb-fullscreen] [data-windows-menu]{display:none!important}'
    ].join('')
    const FS_ATTR = 'data-dsrb-fullscreen'

    // ── 状态存取 ────────────────────────────────────────────────────────
    // state / officialDragging 挂载时由 apply() 注入，工厂层辅助函数共享
    let state = {}
    let officialDragging = false // 官方手柄拖动中（此期间不插手宽度）
    function readState() {
      try {
        const raw = localStorage.getItem(STATE_KEY)
        return raw ? JSON.parse(raw) : {}
      } catch {
        return {}
      }
    }
    function writeState(patch) {
      try {
        const next = Object.assign(readState(), patch)
        localStorage.setItem(STATE_KEY, JSON.stringify(next))
      } catch {
        // 存储不可用时忽略，不影响使用
      }
    }
    function clampPos(x, y, w, h) {
      const maxX = Math.max(4, window.innerWidth - w - 4)
      const maxY = Math.max(4, window.innerHeight - h - 4)
      return [Math.min(Math.max(4, x), maxX), Math.min(Math.max(4, y), maxY)]
    }

    // ── 字体选择：候选表 / 本机可用性检测 / 官方排印 token 的重发 ────────
    // 候选 = 经典常用字体；实际显示前逐个检测本机是否已装，未装的不出现。
    // names = local() 引用的字体名（英文名优先，附中文名双保险）；
    // bold = 真粗体面的完整名（仅部分字体有，用 local() 引用真粗体面）。
    const TEXT_FONTS_CJK = [
      { id: 'yahei', label: '微软雅黑', name: 'Microsoft YaHei', names: ['Microsoft YaHei', '微软雅黑'], bold: ['Microsoft YaHei Bold', 'Microsoft YaHei-Bold'] },
      { id: 'simsun', label: '宋体', name: 'SimSun', names: ['SimSun', '宋体'] },
      { id: 'simhei', label: '黑体', name: 'SimHei', names: ['SimHei', '黑体'] },
      { id: 'kaiti', label: '楷体', name: 'KaiTi', names: ['KaiTi', '楷体'] },
      { id: 'fangsong', label: '仿宋', name: 'FangSong', names: ['FangSong', '仿宋'] },
      { id: 'dengxian', label: '等线', name: 'DengXian', names: ['DengXian', '等线'], bold: ['DengXian Bold', 'DengXian-Bold'] },
      { id: 'youyuan', label: '幼圆', name: 'YouYuan', names: ['YouYuan', '幼圆'] },
      { id: 'stzhongsong', label: '华文中宋', name: 'STZhongsong', names: ['STZhongsong', '华文中宋'] },
      { id: 'stkaiti', label: '华文楷体', name: 'STKaiti', names: ['STKaiti', '华文楷体'] },
      { id: 'stfangsong', label: '华文仿宋', name: 'STFangsong', names: ['STFangsong', '华文仿宋'] },
    ]
    const TEXT_FONTS_LATIN = [
      { id: 'georgia', label: 'Georgia', name: 'Georgia', names: ['Georgia'], bold: ['Georgia Bold', 'Georgia-Bold'] },
      { id: 'times', label: 'Times New Roman', name: 'Times New Roman', names: ['Times New Roman'], bold: ['Times New Roman Bold', 'Times New Roman-Bold'] },
      { id: 'garamond', label: 'Garamond', name: 'Garamond', names: ['Garamond'], bold: ['Garamond Bold', 'Garamond-Bold'] },
      { id: 'bookantiqua', label: 'Book Antiqua', name: 'Book Antiqua', names: ['Book Antiqua'], bold: ['Book Antiqua Bold', 'Book Antiqua-Bold'] },
      { id: 'segoe', label: 'Segoe UI', name: 'Segoe UI', names: ['Segoe UI'], bold: ['Segoe UI Bold', 'Segoe UI-Bold'] },
      { id: 'arial', label: 'Arial', name: 'Arial', names: ['Arial'], bold: ['Arial Bold', 'Arial-Bold'] },
    ]
    // 中英分字区间：共享符号（引号/破折号）由西文面优先；CJK 标点/全角/假名/扩展区
    // 归中文侧；两区间之外落回官方栈
    const LATIN_RANGE = 'U+0020-024F, U+1E00-1EFF, U+2010-201F'
    const CJK_RANGE =
      'U+2010-201F, U+2026, U+2E80-2EFF, U+3000-303F, U+3040-30FF, U+3200-33FF, U+3400-4DBF, ' +
      'U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF, U+20000-2A6DF, U+2A700-2EBEF'
    /** 生成一个虚拟字族的 @font-face 规则。
     *  有真粗体名 → 追加 font-weight:500 900 规则（实测可拿到真粗体）；
     *  无粗体名 → 只留 400 单面（描述符不撒谎，Chromium 才会做合成粗体）。 */
    function faceCss(family, entry, range) {
      const src = (list) => list.map((n) => 'local("' + n + '")').join(',')
      let out = '@font-face{font-family:"' + family + '";src:' + src(entry.names) + ';unicode-range:' + range + ';}'
      if (entry.bold && entry.bold.length) {
        out += '\n@font-face{font-family:"' + family + '";font-weight:500 900;src:' +
          src(entry.bold) + ',' + src(entry.names) + ';unicode-range:' + range + ';}'
      }
      return out
    }
    const CODE_FONTS = [
      { id: 'consolas', label: 'Consolas', css: 'Consolas', name: 'Consolas' },
      { id: 'cascadia', label: 'Cascadia Code', css: '"Cascadia Code"', name: 'Cascadia Code' },
      { id: 'cascadiamono', label: 'Cascadia Mono', css: '"Cascadia Mono"', name: 'Cascadia Mono' },
      { id: 'courier', label: 'Courier New', css: '"Courier New"', name: 'Courier New' },
      { id: 'nsimsun', label: '新宋体', css: '"NSimSun"', name: 'NSimSun' },
      { id: 'firacode', label: 'Fira Code', css: '"Fira Code"', name: 'Fira Code' },
      { id: 'jetbrains', label: 'JetBrains Mono', css: '"JetBrains Mono"', name: 'JetBrains Mono' },
      { id: 'sourcecode', label: 'Source Code Pro', css: '"Source Code Pro"', name: 'Source Code Pro' },
    ]
    let fontDetectCtx = null
    // 字体可用性检测：canvas 字宽比对（与三套通用字族任一不同 = 本机已装）。
    // 不用 document.fonts.check —— Chromium 里它对手写的系统字体名恒为 true。
    function fontAvailable(name) {
      try {
        if (!fontDetectCtx) fontDetectCtx = document.createElement('canvas').getContext('2d')
        const ctx = fontDetectCtx
        if (!ctx) return true // 检测不可用时不隐藏候选
        const TEXT = '字wmWMiIl0O8#@我'
        const width = (font) => {
          ctx.font = font
          return ctx.measureText(TEXT).width
        }
        const quoted = '"' + name + '"'
        return (
          width('32px ' + quoted + ', monospace') !== width('32px monospace') ||
          width('32px ' + quoted + ', sans-serif') !== width('32px sans-serif') ||
          width('32px ' + quoted + ', serif') !== width('32px serif')
        )
      } catch {
        return true
      }
    }
    function fontChoice(list, id) {
      if (!id) return null
      for (const f of list) if (f.id === id) return f
      return null
    }
    // 官方把整套排印 token（--dsw-font-* / --ds-font-*）定义在 :root 与 body 上。
    // 成功解析一次后缓存；官方主题尚未就绪时返回 null（调用方靠定时器稍后重试）。
    let themeFontDecls = null
    function readThemeFontDecls() {
      if (themeFontDecls) return themeFontDecls
      const decls = new Map()
      for (const node of document.querySelectorAll('style')) {
        const text = node.textContent || ''
        if (text.indexOf('--dsw-font') === -1 && text.indexOf('--ds-font') === -1) continue
        if (node.id && node.id.indexOf('dsrb-') === 0) continue // 不扫自家样式
        for (const m of text.matchAll(/(--d(?:sw|s)-font[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
          decls.set(m[1], m[2].trim())
        }
      }
      if (!decls.get('--dsw-font-family') || !decls.get('--ds-font-family-code')) return null
      themeFontDecls = decls
      return decls
    }
    /** 依当前选择生成消息行作用域（[data-chat-node-key]）的排印覆盖 CSS。
     *  字体全默认且未调行距/字距 或 官方主题未就绪 → null（覆盖层保持停用）。 */
    function buildFontPickCss() {
      const decls = readThemeFontDecls()
      if (!decls) return null
      const cjk = fontChoice(TEXT_FONTS_CJK, state.textFontCjk)
      const lat = fontChoice(TEXT_FONTS_LATIN, state.textFontLatin)
      const code = fontChoice(CODE_FONTS, state.codeFont)
      const lineH = typeof state.lineHeight === 'number' ? state.lineHeight : null
      const letterSp = typeof state.letterSpacing === 'number' ? state.letterSpacing : null
      if (!cjk && !lat && !code && lineH === null && letterSp === null) return null
      const offText = decls.get('--dsw-font-family')
      const offCode = decls.get('--ds-font-family-code')
      // 虚拟字族按 西文→中文 排序：引号/破折号等共享区间由西文面优先接住
      const faces = []
      const famNames = []
      if (lat) { faces.push(faceCss('dsrb-text-latin', lat, LATIN_RANGE)); famNames.push('"dsrb-text-latin"') }
      if (cjk) { faces.push(faceCss('dsrb-text-cjk', cjk, CJK_RANGE)); famNames.push('"dsrb-text-cjk"') }
      const fam = famNames.length ? 'var(--dsrb-family)' : offText
      const cod = code ? 'var(--dsrb-code)' : offCode
      const parts = []
      // 虚拟字族在前（按区间分流）；官方原栈殿后兜底：区间外字符与缺字逐字回退
      if (famNames.length) parts.push('--dsrb-family:' + famNames.join(', ') + ', ' + offText)
      if (code) parts.push('--dsrb-code:' + code.css + ', ' + offCode)
      if (famNames.length) parts.push('--dsw-font-family:' + fam)
      if (code) parts.push('--ds-font-family-code:' + cod)
      if (famNames.length) parts.push('font-family:var(--dsrb-family)') // 无自身字族的后代（如用户气泡正文）由继承拿到
      for (const [name, value] of decls) {
        if (name === '--dsw-font-family' || name === '--ds-font-family-code') continue
        let next = value
        if (famNames.length && next.indexOf('var(--dsw-font-family)') !== -1) next = next.split('var(--dsw-font-family)').join(fam)
        if (code && next.indexOf('var(--ds-font-family-code)') !== -1) next = next.split('var(--ds-font-family-code)').join(cod)
        // 行距：把简写里字号后的"/行高"按倍率改写（0.5px 步进），字号本身不动
        if (lineH !== null) next = next.replace(/(\/\s*)(\d+(?:\.\d+)?)px/g, (m, lead, n) => lead + Math.round(Number(n) * lineH * 2) / 2 + 'px')
        if (next !== value) parts.push(name + ':' + next)
      }
      if (letterSp !== null) parts.push('letter-spacing:' + letterSp + 'px')
      return faces.join('\n') + '\n[data-chat-node-key]{' + parts.join(';') + '}'
    }

    // ── 官方宽度：与 ConversationWidthControls 同一套读写 ───────────────
    function readWidthPreference() {
      const raw = localStorage.getItem(WIDTH_PREF_KEY)
      if (raw === null) return null
      const value = Number(raw)
      return Number.isFinite(value) && value > 0 ? value : null
    }
    /** 官方钳制上限（列宽 − 两侧手柄的保留宽度）。 */
    function officialMaxFor(column) {
      return Math.max(CONTENT_MIN, Math.round(column - CONTENT_EDGE_BUDGET))
    }
    /** 扩展钳制上限（整个内容列宽）。 */
    function extCapFor(column) {
      return Math.max(CONTENT_MIN, Math.round(column))
    }
    /** 官方"自动"兜底公式（仅用于面板显示）。 */
    function resolveAutoWidth(column) {
      return Math.max(680, Math.min(column * 0.64, 920))
    }
    function widthTargets() {
      const container = document.querySelector('[data-conversation-content]')
      if (!container) return null
      return { container, target: container.parentElement ?? container, column: container.offsetWidth }
    }
    /** 官方手柄拖动优先：把一个宽度状态应用到页面（state.widthPx 为准）。 */
    function applyWidthState() {
      const t = widthTargets()
      if (!t) return
      const { container, target, column } = t
      const omax = officialMaxFor(column)
      const cap = extCapFor(column)
      const px = state.widthPx
      if (px == null) {
        localStorage.removeItem(WIDTH_PREF_KEY)
        target.style.removeProperty('--dsh-chat-user-width')
        container.style.removeProperty('--dsh-chat-content-width')
      } else if (px <= omax) {
        container.style.removeProperty('--dsh-chat-content-width')
        localStorage.setItem(WIDTH_PREF_KEY, String(px))
        target.style.setProperty('--dsh-chat-user-width', px + 'px')
      } else {
        const w = Math.min(px, cap)
        localStorage.setItem(WIDTH_PREF_KEY, String(omax))
        target.style.setProperty('--dsh-chat-user-width', omax + 'px')
        container.style.setProperty('--dsh-chat-content-width', w + 'px')
      }
    }
    function currentWidthInfo() {
      const t = widthTargets()
      if (!t) return null
      const omax = officialMaxFor(t.column)
      const cap = extCapFor(t.column)
      const px = state.widthPx
      const extActive = px != null && px > omax
      let shown
      if (px != null) shown = extActive ? Math.min(px, cap) : px
      else {
        const raw = getComputedStyle(t.container).getPropertyValue('--dsh-chat-user-width').trim()
        shown = raw ? Number.parseFloat(raw) : resolveAutoWidth(t.column)
      }
      return { px: shown, auto: px == null, ext: extActive, column: t.column, min: CONTENT_MIN, max: cap }
    }
    /** 漂移修复：官方重发布 / 窗口变化后把我们的状态归位（官方手柄拖动中不插手）。 */
    function normalizeWidthDrift() {
      if (officialDragging) return
      const t = widthTargets()
      if (!t) return
      const omax = officialMaxFor(t.column)
      const cap = extCapFor(t.column)
      const px = state.widthPx
      if (px == null) return
      if (px > omax) {
        const w = Math.min(px, cap) + 'px'
        if (t.container.style.getPropertyValue('--dsh-chat-content-width') !== w) {
          t.container.style.setProperty('--dsh-chat-content-width', w)
        }
        if (localStorage.getItem(WIDTH_PREF_KEY) !== String(omax)) {
          localStorage.setItem(WIDTH_PREF_KEY, String(omax))
        }
        // 官方 observer 可能先按旧键重发布残留值 —— 立即 peg 回官方上限，避免被手柄当作拖动基点
        if (t.target.style.getPropertyValue('--dsh-chat-user-width') !== omax + 'px') {
          t.target.style.setProperty('--dsh-chat-user-width', omax + 'px')
        }
      } else {
        if (t.container.style.getPropertyValue('--dsh-chat-content-width')) {
          t.container.style.removeProperty('--dsh-chat-content-width')
        }
        if (localStorage.getItem(WIDTH_PREF_KEY) !== String(px)) {
          localStorage.setItem(WIDTH_PREF_KEY, String(px))
        }
        if (t.target.style.getPropertyValue('--dsh-chat-user-width') !== px + 'px') {
          t.target.style.setProperty('--dsh-chat-user-width', px + 'px')
        }
      }
    }

    // ── 字号（官方直连 + 超范围缩放层） ─────────────────────────────────
    const fontState = { official: null }
    let fontSvc = null
    let fontSelfWrite = false
    function fallbackBasePx() {
      // 官方把该变量写在 body 内联样式上（见上方常量注释）；主题服务未就绪时的兜底
      const inline = Number.parseFloat(document.body.style.getPropertyValue(CONTENT_FONT_SIZE_VARIABLE))
      return Number.isFinite(inline) && inline > 0 ? inline : 14
    }
    /** 把当前字号状态画到页面上（官方范围内 = 纯官方；超出 = 官方值 × 补齐倍率）。 */
    function applyFont() {
      const tag = document.getElementById(FONT_STYLE_ID)
      if (!tag) return
      const base = fontState.official ?? fallbackBasePx()
      const target = typeof state.fontPx === 'number' ? state.fontPx : base
      const scale = target / base
      const root = document.documentElement
      root.style.setProperty('--dsrb-font-base', base + 'px')
      root.style.setProperty('--dsrb-font-scale', String(scale))
      tag.disabled = Math.abs(scale - 1) < 0.001 // 无缩放 → 样式表彻底停用，回到官方原样
    }
    /** 写官方字号（带自我写入标记，避免 themes/change 回环打架）。 */
    function writeOfficialFont(px) {
      if (!fontSvc || typeof fontSvc.setFontSize !== 'function') return
      if (fontState.official === px) return
      fontSelfWrite = true
      try {
        fontSvc.setFontSize(px)
      } catch {
        // 官方校验拒绝时忽略（理论不可达：调用处已夹在 10–22 内）
      }
      fontSelfWrite = false
    }
    // ── 工具 ────────────────────────────────────────────────────────────
    function el(tag, className, text) {
      const node = document.createElement(tag)
      if (className) node.className = className
      if (text !== undefined) node.textContent = text
      return node
    }
    /** 整条长条可点（含开关本体）：鼠标路径唯一 —— 本处理器显式翻转并 preventDefault
     *  （input 已 pointer-events:none、外壳非 label，不会叠加原生翻转）；键盘派生的
     *  click 目标恰为 input，交还原生 change 路径。 */
    function bindRowToggle(row, toggle, apply) {
      row.addEventListener('click', (e) => {
        if (e.target === toggle) return // 键盘空格：走原生（change 监听里统一 apply）
        e.preventDefault()
        toggle.checked = !toggle.checked
        apply()
      })
    }

    // ── 插件本体 ────────────────────────────────────────────────────────
    function apply(ctx) {
      try {
        // 热重载：DSH 监视插件文件变化，会再次执行本客户端。先拆旧实例、再按 id
        // 清扫遗留节点、最后重建 —— 页面上运行的必然是最新代码（旧实例的监听闭包
        // 随节点删除失联、残留定时器空转，均无害）。
        const prevDispose = window.__dsrbDispose
        if (typeof prevDispose === 'function') {
          try { prevDispose() } catch { /* 旧实例拆除失败也不阻塞重建 */ }
        }
        for (const staleId of [FAB_ID, PANEL_ID, STYLE_ID, HIDE_STYLE_ID, MINI_STYLE_ID, HIDE_TOP_STYLE_ID, FONT_STYLE_ID, FONT_PICK_STYLE_ID, FS_STYLE_ID]) {
          const staleNode = document.getElementById(staleId)
          if (staleNode) staleNode.remove()
        }
        if (document.getElementById(FAB_ID)) return // 拆除后仍在＝异常态，守住不重复挂载

        state = readState()
        // 输入框：开关 + 形式。迁移：0.2.2 三态键 / 0.2.1 布尔键 → 开关 + 形式
        // （旧"隐藏开"→ 完全隐藏，保住既有观感；旧"迷你"→ 收缩）。须在样式表挂载前定妥。
        if (state.composerForm !== 'hidden' && state.composerForm !== 'collapse') {
          if (state.composerMode === 'mini') {
            state.hideComposer = true
            state.composerForm = 'collapse'
          } else if (state.composerMode === 'hidden') {
            state.hideComposer = true
            state.composerForm = 'hidden'
          } else {
            state.composerForm = state.hideComposer === true ? 'hidden' : 'collapse'
          }
        }
        state.hideComposer = !!state.hideComposer

        // 1) 样式表：基础外观 + 各功能覆盖层
        const style = el('style')
        style.id = STYLE_ID
        style.textContent = CSS
        const hideTag = el('style')
        hideTag.id = HIDE_STYLE_ID
        hideTag.textContent = HIDE_CSS
        const miniTag = el('style')
        miniTag.id = MINI_STYLE_ID
        miniTag.textContent = MINI_CSS
        const hideTopTag = el('style')
        hideTopTag.id = HIDE_TOP_STYLE_ID
        hideTopTag.textContent = HIDE_TOP_CSS
        const fontTag = el('style')
        fontTag.id = FONT_STYLE_ID
        fontTag.textContent = FONT_CSS
        const fontPickTag = el('style') // 字体选择覆盖层（未选择 / 主题未就绪时保持停用）
        fontPickTag.id = FONT_PICK_STYLE_ID
        const fsTag = el('style') // 全屏补偿层（常驻；仅存在全屏标记时才有匹配规则生效）
        fsTag.id = FS_STYLE_ID
        fsTag.textContent = FS_CSS
        document.head.append(style, hideTag, miniTag, hideTopTag, fontTag, fontPickTag, fsTag)
        // disabled 必须在挂入文档后再设：未连接的 <style> 没有关联样式表，挂载前设置
        // 会被静默丢弃（CSSOM 行为），否则隐藏层将无视已保存状态（字体层由 rebuildFontPick 按需启用）。
        hideTag.disabled = !(state.hideComposer && state.composerForm === 'hidden')
        miniTag.disabled = !(state.hideComposer && state.composerForm !== 'hidden')
        hideTopTag.disabled = !state.hideTop
        fontPickTag.disabled = true

        // 2) 悬浮圆钮
        const fab = el('button', 'dsrb-fab', 'Aa')
        fab.id = FAB_ID
        fab.type = 'button'
        fab.title = 'Happy Reader（拖动可移动）'
        const [fx, fy] = clampPos(
          state.x ?? window.innerWidth - FAB_SIZE - 16,
          state.y ?? window.innerHeight - FAB_SIZE - 16,
          FAB_SIZE,
          FAB_SIZE,
        )
        fab.style.left = fx + 'px'
        fab.style.top = fy + 'px'
        document.body.appendChild(fab)

        // 3) 面板
        const panel = el('div', 'dsrb-panel')
        panel.id = PANEL_ID

        const headRow = el('div', 'dsrb-head')
        const title = el('h4')
        title.append('Happy Reader')
        const headHint = el('span', 'dsrb-headHint', '点面板外关闭')
        const closeBtn = el('button', 'dsrb-x', '×')
        closeBtn.type = 'button'
        closeBtn.title = '关闭'
        headRow.append(title, headHint, closeBtn)

        // 行：隐藏输入框（0.2.1 形式：整条可点开关；"收缩 / 完全隐藏"在面板底部"设置"里选）
        const rowHide = el('div', 'dsrb-row dsrb-row-click')
        const switchBox = el('span', 'dsrb-switch') // 用 span 而非 label：没有原生转发激活面
        const hideToggle = el('input')
        hideToggle.type = 'checkbox'
        switchBox.append(hideToggle, el('span'))
        const hideMain = el('div', 'dsrb-rowMain')
        const hideSubEl = el('div', 'dsrb-rowSub', '输入框收缩为底部细线，鼠标悬停展开')
        hideMain.append(el('div', 'dsrb-rowTitle', '隐藏输入框'), hideSubEl)
        rowHide.append(switchBox, hideMain)

        // 行：隐藏上边栏（整条可点）
        const rowTop = el('div', 'dsrb-row dsrb-row-click')
        const topBox = el('span', 'dsrb-switch')
        const topToggle = el('input')
        topToggle.type = 'checkbox'
        topBox.append(topToggle, el('span'))
        const topMain = el('div', 'dsrb-rowMain')
        topMain.append(el('div', 'dsrb-rowTitle', '隐藏上边栏'), el('div', 'dsrb-rowSub', '收起会话标题栏'))
        rowTop.append(topBox, topMain)

        // 行：行距 / 字距（面板最下方；默认 = 官方原样）
        const rowType = el('div', 'dsrb-row')
        const typeMain = el('div', 'dsrb-rowMain')
        typeMain.append(el('div', 'dsrb-rowTitle', '行距 / 字距'), el('div', 'dsrb-rowSub', '默认 = 官方原样'))
        const typePair = el('div', 'dsrb-pair')
        const lhCol = el('div', 'dsrb-pairCol')
        const lhMini = el('div', 'dsrb-mini')
        const lhVal = el('b', null, '默认')
        lhMini.append('行距 ', lhVal)
        const lhStepper = el('div', 'dsrb-stepper')
        const lhMinus = el('button', null, '−')
        const lhPlus = el('button', null, '＋')
        lhMinus.type = lhPlus.type = 'button'
        lhStepper.append(lhMinus, lhPlus)
        lhCol.append(lhMini, lhStepper)
        const lsCol = el('div', 'dsrb-pairCol')
        const lsMini = el('div', 'dsrb-mini')
        const lsVal = el('b', null, '默认')
        lsMini.append('字距 ', lsVal)
        const lsStepper = el('div', 'dsrb-stepper')
        const lsMinus = el('button', null, '−')
        const lsPlus = el('button', null, '＋')
        lsMinus.type = lsPlus.type = 'button'
        lsStepper.append(lsMinus, lsPlus)
        lsCol.append(lsMini, lsStepper)
        typePair.append(lhCol, lsCol)
        typeMain.append(typePair)
        rowType.append(typeMain)

        // 行：字号
        const rowFont = el('div', 'dsrb-row')
        const fontMain = el('div', 'dsrb-rowMain')
        const fontTitle = el('div', 'dsrb-rowTitle')
        const fontVal = el('b', null, '…')
        fontTitle.append('字号 ', fontVal)
        fontMain.append(fontTitle, el('div', 'dsrb-rowSub', '与官方设置同步'))
        const stepper = el('div', 'dsrb-stepper')
        const fontMinus = el('button', null, '−')
        const fontPlus = el('button', null, '＋')
        fontMinus.type = fontPlus.type = 'button'
        stepper.append(fontMinus, fontPlus)
        rowFont.append(fontMain, stepper)

        // 行：正文字体（中文、西文两个独立下拉压缩在同一行；中文下拉只接管中日韩
        // 字符与中文标点，西文下拉只接管拉丁字母/数字/西文标点，各自独立、互不串扰）
        const rowTextFont = el('div', 'dsrb-row')
        const textFontMain = el('div', 'dsrb-rowMain')
        textFontMain.append(el('div', 'dsrb-rowTitle', '正文字体'), el('div', 'dsrb-rowSub', '仅显示本机已装字体'))
        const textPair = el('div', 'dsrb-pair')
        const cjkCol = el('div', 'dsrb-pairCol')
        cjkCol.append(el('div', 'dsrb-mini', '中文'))
        const textCjkSelect = el('select', 'dsrb-select')
        cjkCol.append(textCjkSelect)
        const latinCol = el('div', 'dsrb-pairCol')
        latinCol.append(el('div', 'dsrb-mini', '西文'))
        const textLatinSelect = el('select', 'dsrb-select')
        latinCol.append(textLatinSelect)
        textPair.append(cjkCol, latinCol)
        textFontMain.append(textPair)
        rowTextFont.append(textFontMain)

        // 行：代码字体（消息内代码与代码块）
        const rowCodeFont = el('div', 'dsrb-row')
        const codeFontMain = el('div', 'dsrb-rowMain')
        codeFontMain.append(el('div', 'dsrb-rowTitle', '代码字体'), el('div', 'dsrb-rowSub', '仅显示本机已装字体'))
        const codeFontSelect = el('select', 'dsrb-select')
        codeFontMain.append(codeFontSelect)
        rowCodeFont.append(codeFontMain)

        // 行：内容宽度
        const rowWidth = el('div', 'dsrb-row')
        const widthMain = el('div', 'dsrb-rowMain')
        const widthTitle = el('div', 'dsrb-rowTitle')
        const widthVal = el('b', null, '…')
        widthTitle.append('内容宽度 ', widthVal)
        widthMain.append(widthTitle, el('div', 'dsrb-rowSub', '与官方手柄同步'))
        const widthRow = el('div', 'dsrb-widthRow')
        const widthSlider = el('input')
        widthSlider.type = 'range'
        widthSlider.step = '5'
        widthSlider.min = String(CONTENT_MIN)
        widthSlider.max = String(CONTENT_MIN)
        const widthReset = el('button', null, '自动')
        widthReset.type = 'button'
        widthRow.append(widthSlider, widthReset)
        widthMain.append(widthRow)
        rowWidth.append(widthMain)

        // 行：全屏（整条可点；开关状态与真实全屏状态双向同步）
        const rowFullscreen = el('div', 'dsrb-row dsrb-row-click')
        const fsBox = el('span', 'dsrb-switch')
        const fsToggle = el('input')
        fsToggle.type = 'checkbox'
        fsBox.append(fsToggle, el('span'))
        const fsMain = el('div', 'dsrb-rowMain')
        fsMain.append(el('div', 'dsrb-rowTitle', '全屏'), el('div', 'dsrb-rowSub', '铺满屏幕 · Esc 退出'))
        rowFullscreen.append(fsBox, fsMain)

        // 三段式结构：拉拽条 / 滚动内容区 / 拉拽条 —— 内容在中间滚动，两条拉拽条
        // 永远贴住面板的视觉上/下缘（滚动容器里的绝对定位元素会随内容滚走，不能用绝对定位）
        const resizeTop = el('div', 'dsrb-resize-top')
        const resizeBottom = el('div', 'dsrb-resize')
        // 设置区（面板最下方，点击展开/收起）——当前含"隐藏输入框的形式"
        const setHeadRow = el('div', 'dsrb-row dsrb-row-click dsrb-setHead')
        const setChev = el('span', 'dsrb-chev', '▸')
        const setHeadMain = el('div', 'dsrb-rowMain')
        setHeadMain.append(el('div', 'dsrb-rowTitle', '设置'))
        setHeadRow.append(setHeadMain, setChev)
        const setBody = el('div', 'dsrb-setBody')
        setBody.style.display = 'none'
        const formRow = el('div', 'dsrb-row')
        const formMain = el('div', 'dsrb-rowMain')
        formMain.append(el('div', 'dsrb-rowTitle', '隐藏输入框的形式'), el('div', 'dsrb-rowSub', '收缩 = 底部细线，悬停 / 点击展开'))
        const formSeg = el('div', 'dsrb-seg')
        const formButtons = {}
        for (const [form, label] of [['collapse', '收缩'], ['hidden', '完全隐藏']]) {
          const b = el('button', null, label)
          b.type = 'button'
          b.addEventListener('click', () => {
            state.composerForm = form
            applyComposerUI()
          })
          formButtons[form] = b
          formSeg.append(b)
        }
        formRow.append(formMain, formSeg)
        setBody.append(formRow)
        setHeadRow.addEventListener('click', (e) => {
          if (e.target && e.target.closest && e.target.closest('button')) return
          const opening = setBody.style.display === 'none'
          setBody.style.display = opening ? '' : 'none'
          setChev.textContent = opening ? '▾' : '▸'
        })
        const panelBody = el('div', 'dsrb-body')
        panelBody.append(headRow, rowFont, rowTextFont, rowCodeFont, rowWidth, rowFullscreen, rowHide, rowTop, rowType, setHeadRow, setBody)
        panel.append(resizeTop, panelBody, resizeBottom)
        panel.style.display = state.open ? '' : 'none'
        document.body.appendChild(panel)

        // ── 面板定位（四个方位择一，绝不压住按钮；避开右上角系统按钮条） ──
        // 右上角三枚系统按钮是 Electron WCO 原生叠层（绘制在网页层之上、无法覆盖）：
        // 面板伸进该区右上角会被压住 —— 落点横跨时纵向从条底之下开始。条高取官方
        // 窗口标题条变量（全屏无此条，按 0 处理）；条宽 = 三枚按钮叠层宽（DIP）。
        const titlebarH =
          Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height')) || 40
        const CAP_W = 138
        function placePanel() {
          const r = fab.getBoundingClientRect()
          panel.style.height = ''
          panel.style.maxHeight = '' // 先按自然高度测量
          const pw = panel.offsetWidth || PANEL_WIDTH
          const natural = panel.offsetHeight || 240
          const GAP = 6
          const M = 8
          const vw = window.innerWidth
          const vh = window.innerHeight
          const CAP_H = document.fullscreenElement ? 0 : titlebarH
          // 定位按"实际将显示的高度"算 —— 底缘才能与按钮对齐，不会忽远忽近
          const desired = typeof state.panelH === 'number' ? state.panelH : Math.min(natural, PANEL_MAX_H)
          const ph = Math.max(PANEL_MIN_H, Math.min(desired, vh - 2 * M - BORDER_Y))
          const clampX = (x) => Math.min(Math.max(M, x), Math.max(M, vw - pw - M))
          const clampY = (y, yMin) => Math.min(Math.max(yMin, y), Math.max(yMin, vh - ph - BORDER_Y - M))
          let best = null
          if (typeof state.panelX === 'number' && typeof state.panelY === 'number') {
            // 用户拖过位置 → 用记住的位置；仍做两件保护：避开右上角系统按钮条；
            // 若与按钮重叠（按钮可能后来被拖到附近）则放弃记忆、回自动布局
            const sx = clampX(state.panelX)
            const sy = clampY(state.panelY, CAP_H > 0 && sx + pw > vw - CAP_W ? CAP_H : M)
            const overlapsFab = sx < r.right + GAP && sx + pw > r.left - GAP && sy < r.bottom + GAP && sy + ph > r.top - GAP
            if (overlapsFab) {
              state.panelX = null
              state.panelY = null
              writeState({ panelX: null, panelY: null })
            } else {
              best = { x: sx, y: sy }
            }
          }
          if (!best) {
            const cx = r.left + r.width / 2 - pw / 2
            const candidates = [
              { x: r.left - pw - GAP, y: r.bottom - ph }, // 左（底缘与按钮底对齐，贴近右下）
              { x: r.right + GAP, y: r.bottom - ph }, // 右（同上）
              { x: cx, y: r.top - ph - GAP }, // 上
              { x: cx, y: r.bottom + GAP }, // 下
            ]
            const hits = (x, y) =>
              x < r.right + GAP && x + pw > r.left - GAP && y < r.bottom + GAP && y + ph > r.top - GAP
            for (const c of candidates) {
              const x = clampX(c.x)
              const yMin = CAP_H > 0 && x + pw > vw - CAP_W ? CAP_H : M
              const y = clampY(c.y, yMin)
              if (!hits(x, y)) {
                best = { x, y }
                break
              }
              // 兜底：记录重叠面积最小的候选（窗口极小时才会用到）
              const ox = Math.max(0, Math.min(x + pw, r.right + GAP) - Math.max(x, r.left - GAP))
              const oy = Math.max(0, Math.min(y + ph, r.bottom + GAP) - Math.max(y, r.top - GAP))
              const area = ox * oy
              if (!best || area < best.area) best = { x, y, area }
            }
          }
          panel.style.left = best.x + 'px'
          panel.style.top = best.y + 'px'
          // 应用最终高度：以定位时采用的 ph 为准，再按落点与视口底缘的剩余空间收紧
          const finalH = Math.max(PANEL_MIN_H, Math.min(ph, vh - best.y - M - BORDER_Y))
          panel.style.maxHeight = finalH + 'px'
          if (typeof state.panelH === 'number') panel.style.height = finalH + 'px'
        }
        function togglePanel(open) {
          state.open = open
          panel.style.display = open ? '' : 'none'
          if (open) {
            renderWidthRow()
            renderFontRow()
            placePanel()
          }
          writeState({ open })
        }

        // ── 面板渲染 ────────────────────────────────────────────────────
        function setFontPx(v) {
          const next = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(v)))
          state.fontPx = next
          if (next <= FONT_OFFICIAL_MAX) writeOfficialFont(next) // 官方范围内：直写官方设置
          // 超出 22：官方设置保持原样，仅用缩放层补齐
          applyFont()
          renderFontRow()
          writeState({ fontPx: next })
        }
        function renderFontRow() {
          fontVal.textContent = typeof state.fontPx === 'number' ? state.fontPx + 'px' : '—'
          fontMinus.disabled = typeof state.fontPx !== 'number' || state.fontPx <= FONT_MIN
          fontPlus.disabled = typeof state.fontPx !== 'number' || state.fontPx >= FONT_MAX
        }
        function renderWidthRow() {
          const info = currentWidthInfo()
          if (!info) {
            widthSlider.disabled = true
            widthReset.disabled = true
            widthVal.textContent = '—（打开会话后可用）'
            return
          }
          widthSlider.min = String(info.min)
          widthSlider.max = String(info.max)
          widthSlider.disabled = info.max <= CONTENT_MIN
          widthReset.disabled = info.auto
          if (!widthDragging) {
            widthSlider.value = String(Math.round(Math.min(Math.max(info.px, info.min), info.max)))
          }
          widthVal.textContent = Math.round(info.px) + 'px'
        }
        function renderAll() {
          renderComposerRows()
          topToggle.checked = !!state.hideTop
          textCjkSelect.value = state.textFontCjk ?? ''
          textLatinSelect.value = state.textFontLatin ?? ''
          codeFontSelect.value = state.codeFont ?? ''
          renderFontRow()
          renderTypeRow()
          renderWidthRow()
        }

        // ── 功能 1：隐藏输入框（开关）+ 形式（收缩 / 完全隐藏，在底部"设置"里选） ──
        function applyComposerUI() {
          const on = !!state.hideComposer
          const useHidden = on && state.composerForm === 'hidden'
          const useMini = on && state.composerForm !== 'hidden'
          hideTag.disabled = !useHidden
          miniTag.disabled = !useMini
          renderComposerRows()
          writeState({
            hideComposer: on,
            composerForm: state.composerForm,
            composerMode: !on ? 'normal' : (useHidden ? 'hidden' : 'mini'), // 过渡版本键镜像
          })
        }
        function renderComposerRows() {
          hideToggle.checked = !!state.hideComposer
          hideSubEl.textContent = state.composerForm === 'hidden'
            ? '完全隐藏输入框'
            : '输入框收缩为底部细线，鼠标悬停展开'
          for (const [form, b] of Object.entries(formButtons)) b.className = state.composerForm === form ? 'on' : ''
        }
        function onComposerToggle() {
          state.hideComposer = hideToggle.checked
          applyComposerUI()
        }
        hideToggle.addEventListener('change', onComposerToggle)
        bindRowToggle(rowHide, hideToggle, onComposerToggle)

        // ── 功能 2：隐藏上边栏（开关 + 整条长条可点） ────────────────────
        function applyHideTop() {
          state.hideTop = topToggle.checked
          hideTopTag.disabled = !state.hideTop
          writeState({ hideTop: state.hideTop })
        }
        topToggle.addEventListener('change', applyHideTop)
        bindRowToggle(rowTop, topToggle, applyHideTop)

        // ── 功能 6：全屏（开关与真实全屏状态双向同步；Esc 退出后自动回位） ──
        function inPageFullscreen() {
          return document.fullscreenElement === document.documentElement
        }
        function syncFullscreen() {
          // 事实来源是 document.fullscreenElement：可能不是本插件打开的（Esc、或应用内
          // 其它元素全屏），因此由 fullscreenchange 事件无条件校正开关与补偿标记
          const on = inPageFullscreen()
          fsToggle.checked = on
          const root = document.documentElement
          if (on) root.setAttribute(FS_ATTR, '')
          else root.removeAttribute(FS_ATTR)
          // 全屏切换会改变系统按钮条的有无 → 面板开着时当场重定位
          if (state.open) placePanel()
        }
        function applyFullscreen() {
          // 进入全屏必须发生在用户手势内：本函数由开关 change / 整条点击同步触发，满足
          const want = fsToggle.checked
          const fail = (err) => {
            // 被拒绝（无手势 / 被策略拦截等）：把开关拨回真实状态，功能静默降级
            console.warn('[dsh-happy-reader] 全屏切换失败：', err)
            syncFullscreen()
          }
          try {
            const p = want ? document.documentElement.requestFullscreen() : document.exitFullscreen()
            if (p) p.catch(fail)
          } catch (err) {
            fail(err)
          }
        }
        document.addEventListener('fullscreenchange', syncFullscreen)
        fsToggle.addEventListener('change', applyFullscreen)
        bindRowToggle(rowFullscreen, fsToggle, applyFullscreen)
        syncFullscreen() // 初始对齐（热重载等场景下若已在全屏，开关与标记立即正确）

        // ── 功能 3：字号 ────────────────────────────────────────────────
        fontMinus.addEventListener('click', () => {
          setFontPx((typeof state.fontPx === 'number' ? state.fontPx : fontState.official ?? 16) - 1)
        })
        fontPlus.addEventListener('click', () => {
          setFontPx((typeof state.fontPx === 'number' ? state.fontPx : fontState.official ?? 16) + 1)
        })

        // ── 功能 5：字体选择（正文·中文 / 正文·西文 / 代码） ───────────
        textCjkSelect.addEventListener('change', () => {
          const id = textCjkSelect.value || null
          state.textFontCjk = fontChoice(availCjk, id) ? id : null
          textCjkSelect.value = state.textFontCjk ?? ''
          writeState({ textFontCjk: state.textFontCjk })
          fontPickBuilt = false
          rebuildFontPick()
        })
        textLatinSelect.addEventListener('change', () => {
          const id = textLatinSelect.value || null
          state.textFontLatin = fontChoice(availLatin, id) ? id : null
          textLatinSelect.value = state.textFontLatin ?? ''
          writeState({ textFontLatin: state.textFontLatin })
          fontPickBuilt = false
          rebuildFontPick()
        })
        codeFontSelect.addEventListener('change', () => {
          const id = codeFontSelect.value || null
          state.codeFont = fontChoice(availCode, id) ? id : null
          codeFontSelect.value = state.codeFont ?? ''
          writeState({ codeFont: state.codeFont })
          fontPickBuilt = false
          rebuildFontPick()
        })

        // ── 功能 7：行距 / 字距（0.1 步进；到达边界即回"默认"，覆盖层随之停用） ──
        function setLineHeight(v) {
          const next = Math.min(LINEH_MAX, Math.max(LINEH_MIN, Math.round(v * 10) / 10))
          state.lineHeight = next > LINEH_MIN ? next : null
          fontPickBuilt = false
          rebuildFontPick()
          renderTypeRow()
          writeState({ lineHeight: state.lineHeight })
        }
        function setLetterSpacing(v) {
          const next = Math.min(LETTERSP_MAX, Math.max(LETTERSP_MIN, Math.round(v * 10) / 10))
          state.letterSpacing = next !== 0 ? next : null
          fontPickBuilt = false
          rebuildFontPick()
          renderTypeRow()
          writeState({ letterSpacing: state.letterSpacing })
        }
        function renderTypeRow() {
          lhVal.textContent = state.lineHeight ? state.lineHeight.toFixed(1) + '×' : '默认'
          lsVal.textContent = state.letterSpacing ? state.letterSpacing.toFixed(1) + 'px' : '默认'
        }
        lhMinus.addEventListener('click', () => setLineHeight((state.lineHeight ?? LINEH_MIN) - 0.1))
        lhPlus.addEventListener('click', () => setLineHeight((state.lineHeight ?? LINEH_MIN) + 0.1))
        lsMinus.addEventListener('click', () => setLetterSpacing((state.letterSpacing ?? 0) - 0.1))
        lsPlus.addEventListener('click', () => setLetterSpacing((state.letterSpacing ?? 0) + 0.1))

        // ── 功能 4：内容宽度 ────────────────────────────────────────────
        let widthDragging = false // 我方滑块拖动中
        officialDragging = false // 官方手柄拖动中（工厂层辅助函数共享）
        let officialDragMoved = false
        let officialDragStart = null
        let officialDragAdopt = false
        function setWidthPx(v) {
          if (v === null) {
            state.widthPx = null
          } else {
            const t = widthTargets()
            if (!t) return // 无会话容器（滑块与"自动"此时均处于禁用态）
            state.widthPx = Math.min(Math.max(Math.round(v), CONTENT_MIN), extCapFor(t.column))
          }
          applyWidthState()
          writeState({ widthPx: state.widthPx })
          renderWidthRow()
        }
        widthSlider.addEventListener('pointerdown', () => {
          widthDragging = true
        })
        function onWindowPointerUp() {
          if (widthDragging) {
            widthDragging = false
            renderWidthRow()
          }
        }
        window.addEventListener('pointerup', onWindowPointerUp)
        widthSlider.addEventListener('input', () => {
          setWidthPx(Number(widthSlider.value))
        })
        widthReset.addEventListener('click', () => {
          setWidthPx(null)
        })

        // 官方手柄 / 面板外点击（document 捕获阶段，先于应用本体收到事件）
        function onDocPointerDown(e) {
          const target = e.target
          const handle = target && target.closest ? target.closest('[data-width-handle]') : null
          if (handle) {
            officialDragging = true
            officialDragMoved = false
            officialDragStart = { x: e.clientX, y: e.clientY }
            const t = widthTargets()
            officialDragAdopt = !!(t && state.widthPx != null && state.widthPx > officialMaxFor(t.column))
          }
          // 迷你（收缩）输入框：点击细线任意处即展开（聚焦输入元素，"展开"交给 :focus-within）
          if (state.hideComposer && state.composerForm !== 'hidden' && target && target.closest) {
            const seat = target.closest('[data-composer-seat]')
            if (seat) {
              const ed = seat.querySelector('textarea, input, [contenteditable]:not([contenteditable="false"])')
              if (ed && document.activeElement !== ed) ed.focus()
            }
          }
          if (state.open && !panel.contains(target) && !fab.contains(target)) {
            togglePanel(false)
          }
        }
        function onDocPointerMove(e) {
          if (!officialDragging || officialDragMoved) return
          if (!officialDragStart) return
          if (Math.abs(e.clientX - officialDragStart.x) + Math.abs(e.clientY - officialDragStart.y) < 4) return
          officialDragMoved = true
          if (officialDragAdopt) {
            // 交还官方：移除覆盖，让拖动实时预览
            const t = widthTargets()
            if (t) t.container.style.removeProperty('--dsh-chat-content-width')
          }
        }
        function onDocPointerUp() {
          if (!officialDragging) return
          const adopt = officialDragAdopt && officialDragMoved
          officialDragMoved = false
          officialDragStart = null
          officialDragAdopt = false
          if (!adopt) {
            officialDragging = false
            return
          }
          // 采纳期间保持"官方拖动中"状态：定点漂移修复不会抢在官方提交之前插手
          setTimeout(() => {
            officialDragging = false
            const pref = readWidthPreference()
            state.widthPx = pref != null ? pref : null
            applyWidthState()
            writeState({ widthPx: state.widthPx })
            renderWidthRow()
          }, 0)
        }
        function onDocPointerCancel() {
          officialDragging = false
          officialDragMoved = false
          officialDragStart = null
          officialDragAdopt = false
        }
        document.addEventListener('pointerdown', onDocPointerDown, true)
        document.addEventListener('pointermove', onDocPointerMove, true)
        document.addEventListener('pointerup', onDocPointerUp, true)
        document.addEventListener('pointercancel', onDocPointerCancel, true)

        // 官方手柄拖动 / 窗口尺寸变化 → 目标元素 style 变化 → 反向同步面板
        let watchedTarget = null
        const widthObserver = new MutationObserver(() => {
          if (!widthDragging) renderWidthRow()
        })
        function attachWidthObserver() {
          const t = widthTargets()
          const target = t ? t.target : null
          if (target === watchedTarget) return
          widthObserver.disconnect()
          watchedTarget = target
          if (target) widthObserver.observe(target, { attributes: true, attributeFilter: ['style'] })
        }

        // 列宽突变（侧边栏开合只改 grid 列宽、不触发 window.resize）→ 用与官方
        // ConversationWidthControls 同款的 ResizeObserver 观察同一节点，把覆盖值/
        // 官方键/官方变量的收敛压到同一批回调内，开合过程不再出现滞留窄值的中间态。
        let watchedColumn = null
        const columnObserver = new ResizeObserver(() => {
          normalizeWidthDrift()
          if (state.open && !officialDragging && !widthDragging) renderWidthRow()
        })
        function attachColumnObserver() {
          const t = widthTargets()
          const container = t ? t.container : null
          if (container === watchedColumn) return
          columnObserver.disconnect()
          watchedColumn = container
          if (container) columnObserver.observe(container)
        }

        // ── 功能 3 的服务对接：订阅官方主题（字号基准与官方直连） ────────
        ctx.inject(['theme'], (tctx) => {
          fontSvc = tctx.theme
          let firstSync = true
          const sync = (snap) => {
            const n = snap && snap.fontSize
            if (typeof n === 'number' && n > 0) fontState.official = n
            if (!fontSelfWrite) {
              if (
                firstSync &&
                typeof state.fontPx === 'number' &&
                state.fontPx <= FONT_OFFICIAL_MAX &&
                state.fontPx !== fontState.official
              ) {
                // 启动恢复：面板上次设定的字号（范围内）直写回官方设置，
                // 保证"范围内 ⇔ 官方值 === 面板值"的稳定关系
                firstSync = false
                applyFont()
                writeOfficialFont(state.fontPx) // 官方更新后会再次进入本函数（自写标记路径）
                return
              }
              firstSync = false
              if (typeof state.fontPx !== 'number') state.fontPx = fontState.official
              else if (state.fontPx <= FONT_OFFICIAL_MAX) state.fontPx = fontState.official // 范围内以官方为准
              // 超出 22 的绝对目标保持不动，倍率自动适配
              writeState({ fontPx: state.fontPx })
              renderFontRow()
            }
            applyFont()
          }
          // 先订阅、再首读：启动恢复的 setFontSize 会同步发布 theme/change，
          // 若先读后订会错过这次回声（官方值会暂时读旧）
          tctx.on('theme/change', (snap) => sync(snap))
          try {
            sync(tctx.theme.getTheme())
          } catch {
            applyFont() // 服务首读异常时至少按兜底基准绘制一次
          }
        })

        // ── 启动时应用已保存的功能状态 ──────────────────────────────────
        if (typeof state.fontPx === 'number') {
          state.fontPx = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(state.fontPx)))
        } else {
          state.fontPx = null
        }
        if (typeof state.widthPx !== 'number' || !(state.widthPx > 0)) state.widthPx = null
        if (typeof state.lineHeight === 'number') {
          const lh = Math.min(LINEH_MAX, Math.max(LINEH_MIN, Math.round(state.lineHeight * 10) / 10))
          state.lineHeight = lh > LINEH_MIN ? lh : null
        } else state.lineHeight = null
        if (typeof state.letterSpacing === 'number') {
          const ls = Math.min(LETTERSP_MAX, Math.max(LETTERSP_MIN, Math.round(state.letterSpacing * 10) / 10))
          state.letterSpacing = ls !== 0 ? ls : null
        } else state.letterSpacing = null
        state.panelX = typeof state.panelX === 'number' ? state.panelX : null
        state.panelY = typeof state.panelY === 'number' ? state.panelY : null
        state.panelH = typeof state.panelH === 'number' && state.panelH > 0 ? state.panelH : null

        // ── 字体选择：本机可用性过滤 + 选择恢复 + 覆盖层生成 ────────────
        function fillFontSelect(select, list) {
          select.textContent = ''
          const def = el('option', null, '默认（官方）')
          def.value = ''
          select.append(def)
          for (const f of list) {
            const opt = el('option', null, f.label)
            opt.value = f.id
            select.append(opt)
          }
        }
        const availCjk = TEXT_FONTS_CJK.filter((f) => fontAvailable(f.name)) // 只保留本机已装
        const availLatin = TEXT_FONTS_LATIN.filter((f) => fontAvailable(f.name))
        const availCode = CODE_FONTS.filter((f) => fontAvailable(f.name))
        fillFontSelect(textCjkSelect, availCjk)
        fillFontSelect(textLatinSelect, availLatin)
        fillFontSelect(codeFontSelect, availCode)
        // 已保存的选择若已不在本机（被卸载 / 换机器）→ 回默认
        let fontsReset = false
        if (state.textFontCjk && !fontChoice(availCjk, state.textFontCjk)) {
          state.textFontCjk = null
          fontsReset = true
        }
        if (state.textFontLatin && !fontChoice(availLatin, state.textFontLatin)) {
          state.textFontLatin = null
          fontsReset = true
        }
        if (state.codeFont && !fontChoice(availCode, state.codeFont)) {
          state.codeFont = null
          fontsReset = true
        }
        if (fontsReset) writeState({ textFontCjk: state.textFontCjk, textFontLatin: state.textFontLatin, codeFont: state.codeFont })
        let fontPickBuilt = false
        /** 生成 / 刷新字体与排版覆盖层；官方主题未就绪时保持停用，等定时器重试。 */
        function rebuildFontPick() {
          if (!state.textFontCjk && !state.textFontLatin && !state.codeFont && state.lineHeight == null && state.letterSpacing == null) {
            fontPickTag.disabled = true
            fontPickBuilt = false
            return
          }
          if (fontPickBuilt) return
          const css = buildFontPickCss()
          if (!css) return
          fontPickTag.textContent = css
          fontPickTag.disabled = false
          fontPickBuilt = true
        }

        applyFont()
        renderAll()
        applyWidthState()
        rebuildFontPick()
        // 面板开着启动（上次退出未关）：补挂载定位——不经 togglePanel 时面板没有
        // left/top，会落在文档流静态位置（方向取决于页面流，即错位；实测在左下角）
        if (state.open) placePanel()

        // ── 拖动 + 点击 ─────────────────────────────────────────────────
        let drag = null
        function onPointerDown(e) {
          if (e.button !== 0) return
          drag = { sx: e.clientX, sy: e.clientY, ox: fab.offsetLeft, oy: fab.offsetTop, moved: false }
          fab.setPointerCapture(e.pointerId)
          e.preventDefault()
        }
        function onPointerMove(e) {
          if (!drag) return
          const dx = e.clientX - drag.sx
          const dy = e.clientY - drag.sy
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
          if (!drag.moved) return
          const [x, y] = clampPos(drag.ox + dx, drag.oy + dy, FAB_SIZE, FAB_SIZE)
          fab.style.left = x + 'px'
          fab.style.top = y + 'px'
        }
        function onPointerUp() {
          if (!drag) return
          const wasDrag = drag.moved
          drag = null
          if (wasDrag) {
            writeState({ x: fab.offsetLeft, y: fab.offsetTop })
            if (state.open) placePanel()
          } else {
            togglePanel(!state.open)
          }
        }
        function onPointerCancel() {
          drag = null
        }
        fab.addEventListener('pointerdown', onPointerDown)
        fab.addEventListener('pointermove', onPointerMove)
        fab.addEventListener('pointerup', onPointerUp)
        fab.addEventListener('pointercancel', onPointerCancel)
        closeBtn.addEventListener('click', () => togglePanel(false))

        // ── 功能 8：面板拖动 / 拉拽高度 ──────────────────────────────────
        // 拖动取"面板任意空白处"（交互控件与滚动条除外）；移动/抬起监听挂 window
        //（快速拖动不丢）；>4px 才算拖动、点一下不误记；双击标题栏复位自动布局。
        let panelDrag = null
        let panelResize = null
        const dragBlocked = (target) =>
          !!(target && target.closest && target.closest('button, input, select, a, .dsrb-row-click, .dsrb-resize, .dsrb-resize-top'))
        panel.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || e.pointerType === 'touch' || dragBlocked(e.target)) return
          if (e.target === panelBody && e.offsetX >= panelBody.clientWidth) return // 内容区的滚动条
          panelDrag = {
            sx: e.clientX, sy: e.clientY,
            ox: Number.parseFloat(panel.style.left) || 0,
            oy: Number.parseFloat(panel.style.top) || 0,
            moved: false,
          }
          e.preventDefault()
        })
        const startResize = (fromTop) => (e) => {
          if (e.button !== 0) return
          panelResize = {
            sy: e.clientY,
            oh: panel.offsetHeight,
            oy: Number.parseFloat(panel.style.top) || 0,
            fromTop,
            moved: false,
          }
          e.preventDefault()
        }
        resizeTop.addEventListener('pointerdown', startResize(true))
        resizeBottom.addEventListener('pointerdown', startResize(false))
        function onPanelPointerMove(e) {
          if (panelDrag) {
            const dx = e.clientX - panelDrag.sx
            const dy = e.clientY - panelDrag.sy
            if (Math.abs(dx) + Math.abs(dy) > 4) panelDrag.moved = true
            if (!panelDrag.moved) return
            const x = Math.min(Math.max(0, panelDrag.ox + dx), Math.max(0, window.innerWidth - panel.offsetWidth))
            const y = Math.min(Math.max(0, panelDrag.oy + dy), Math.max(0, window.innerHeight - 34))
            panel.style.left = x + 'px'
            panel.style.top = y + 'px'
          } else if (panelResize) {
            const dy = e.clientY - panelResize.sy
            if (Math.abs(dy) > 4) panelResize.moved = true
            if (!panelResize.moved) return
            if (panelResize.fromTop) {
              // 顶边拉拽：高度与上缘一起变（下缘保持不动）
              let h = Math.max(PANEL_MIN_H, Math.min(panelResize.oh - dy, window.innerHeight - 8))
              let top = panelResize.oy + panelResize.oh - h
              if (top < 0) {
                h += top
                top = 0
              }
              panel.style.top = top + 'px'
              panel.style.height = h + 'px'
              panel.style.maxHeight = h + 'px'
            } else {
              // 底边拉拽：只变高度（上缘不动）
              const maxH = Math.max(PANEL_MIN_H, window.innerHeight - panel.offsetTop - 8)
              const h = Math.min(maxH, Math.max(PANEL_MIN_H, panelResize.oh + dy))
              panel.style.height = h + 'px'
              panel.style.maxHeight = h + 'px'
            }
          }
        }
        function onPanelPointerUp() {
          if (panelDrag) {
            if (panelDrag.moved) {
              const x = Number.parseFloat(panel.style.left)
              const y = Number.parseFloat(panel.style.top)
              if (Number.isFinite(x) && Number.isFinite(y)) {
                state.panelX = x
                state.panelY = y
                writeState({ panelX: x, panelY: y })
              }
            }
            panelDrag = null
          }
          if (panelResize) {
            if (panelResize.moved) {
              const h = Number.parseFloat(panel.style.height)
              if (Number.isFinite(h)) {
                const patch = { panelH: h }
                state.panelH = h
                if (panelResize.fromTop) {
                  // 顶边拉拽同时改变了位置（上缘），一并落盘，否则重开时会被自动布局覆盖
                  const t = Number.parseFloat(panel.style.top)
                  const x = Number.parseFloat(panel.style.left)
                  if (Number.isFinite(t)) {
                    state.panelY = t
                    patch.panelY = t
                  }
                  if (Number.isFinite(x)) {
                    state.panelX = x
                    patch.panelX = x
                  }
                }
                writeState(patch)
              }
            }
            panelResize = null
          }
        }
        window.addEventListener('pointermove', onPanelPointerMove)
        window.addEventListener('pointerup', onPanelPointerUp)
        window.addEventListener('pointercancel', onPanelPointerUp)
        headRow.title = '面板任意空白处可拖动 · 双击标题栏复位'
        headRow.addEventListener('dblclick', () => {
          // 复位：回到自动布局（位置 + 高度一起，回到"高度锁"状态）
          state.panelX = null
          state.panelY = null
          state.panelH = null
          writeState({ panelX: null, panelY: null, panelH: null })
          placePanel()
        })

        // ── 功能 9：复制为 Markdown（标准库实现）—— 选区在消息行内时：标签映射交给
        //    vendored turndown + 官方 gfm 插件（表格/删除线/任务列表；均 MIT、逐字内联见文件尾）；
        //    公式由 KaTeX 官方同源的 annotation 源码出口还原（行内 $…$ / 独立 $$…$$）──
        function findTexSource(root) {
          const walk = (node) => {
            for (const k of node.childNodes) {
              // tagName 大小写随命名空间而变（HTML 大写 / MathML 小写），统一按大写比较
              if (String(k.tagName).toUpperCase() === 'ANNOTATION' && k.getAttribute('encoding') === 'application/x-tex') {
                return (k.textContent || '').trim()
              }
              const hit = walk(k)
              if (hit) return hit
            }
            return ''
          }
          return walk(root)
        }
        let turndownSvc = null
        /** 懒建并复用 turndown 实例（标准库负责标签映射；仅补一条公式规则——
         *  .katex / .katex-display 由 KaTeX 的 annotation 源码出口还原）。 */
        function getTurndown() {
          if (turndownSvc) return turndownSvc
          turndownSvc = new TurndownService({ codeBlockStyle: 'fenced', headingStyle: 'atx', bulletListMarker: '-' })
          turndownSvc.use(turndownPluginGfm.gfm) // GFM 扩展：表格 / 删除线 / 任务列表（官方配套插件，见文件尾 vendored 段）
          turndownSvc.addRule('katex', {
            filter: (node) => {
              const cls = String((node && node.className) || '')
              return /(^|\s)katex(\s|$)/.test(cls) || cls.indexOf('katex-display') !== -1
            },
            replacement: (_content, node) => {
              const tex = findTexSource(node)
              if (!tex) return ''
              return String(node.className).indexOf('katex-display') !== -1 ? '\n$$' + tex + '$$\n' : '$' + tex + '$'
            },
          })
          return turndownSvc
        }
        function onCopy(e) {
          try {
            const sel = document.getSelection()
            if (!sel || sel.isCollapsed || !sel.rangeCount) return
            // 选区两端都要在消息行内才接管（跨区选择保持系统默认行为）
            const inChat = (n) => {
              const el = n && (n.nodeType === 3 ? n.parentElement : n)
              return !!(el && el.closest && el.closest('[data-chat-node-key]'))
            }
            if (!inChat(sel.anchorNode) || !inChat(sel.focusNode)) return
            const elOf = (n) => (n && n.nodeType === 3 ? n.parentElement : n)
            const ka = elOf(sel.anchorNode).closest('.katex')
            const kf = elOf(sel.focusNode).closest('.katex')
            // 只选中了某个公式本身（两端落在同一个公式内）→ 直接输出该公式的 LaTeX
            if (ka && ka === kf) {
              const tex = findTexSource(ka)
              if (tex) {
                e.clipboardData.setData('text/plain', ka.closest('.katex-display') ? '$$' + tex + '$$' : '$' + tex + '$')
                e.clipboardData.setData('text/html', ka.outerHTML) // 富目标（Word 等）粘贴仍显示公式
                e.preventDefault()
                return
              }
            }
            // 与 KaTeX 官方 copy-tex 同策略：端点落在公式内时先把工作范围扩到整个公式，
            // "只碰一角"也能拿到完整 LaTeX（只影响复制内容，不动真实选区）
            const work = sel.getRangeAt(0).cloneRange()
            if (ka) work.setStartBefore(ka)
            if (kf) work.setEndAfter(kf)
            const box = document.createElement('div')
            box.append(work.cloneContents())
            // 公式场景先留存原始 HTML（含 <math>）：粘进 Word 等富目标仍可显示公式
            const html = box.querySelector('.katex') ? box.innerHTML : null
            // 标签→Markdown 映射由标准库 turndown 承担（公式已由上面的 katex 规则还原为 LaTeX）
            const md = getTurndown().turndown(box).replace(/\n{3,}/g, '\n\n').trim()
            if (!md) return
            e.clipboardData.setData('text/plain', md)
            if (html) e.clipboardData.setData('text/html', html)
            e.preventDefault()
          } catch (err) {
            // 任何异常都不阻断这次复制（退回浏览器默认行为）
            console.warn('[dsh-happy-reader] 复制处理失败：', err)
          }
        }
        document.addEventListener('copy', onCopy, true)

        function onResize() {
          const [x, y] = clampPos(fab.offsetLeft, fab.offsetTop, FAB_SIZE, FAB_SIZE)
          fab.style.left = x + 'px'
          fab.style.top = y + 'px'
          normalizeWidthDrift()
          if (state.open) {
            renderWidthRow()
            placePanel()
          }
        }
        window.addEventListener('resize', onResize)

        // 会话 DOM 迟现/被替换 → 轻量定时器持续核对（同节点零开销），顺带漂移兜底与
        // 占位符刷新；列宽突变由 columnObserver 即时处理，定时器只兜底重挂。
        attachWidthObserver()
        attachColumnObserver()
        const retryTimer = setInterval(() => {
          attachWidthObserver()
          attachColumnObserver()
          normalizeWidthDrift()
          rebuildFontPick() // 官方主题样式稍后就绪时补建覆盖层（已建则零开销早退）
          if (state.open && !officialDragging && !widthDragging) renderWidthRow()
        }, 2000)

        // 启动标记：记录加载时刻与版本（供诊断确认插件已加载；不影响功能）
        writeState({ lastBootAt: Date.now(), lastBootVersion: VERSION })
        console.log('[dsh-happy-reader] 客户端半边已加载 v' + VERSION)

        // ── 卸载清理（官方 ctx.effect 机制自动执行；同一函数登记到 window.__dsrbDispose
        //    供热重载重建前先拆旧实例；幂等，可重复调用） ──
        const dispose = () => {
          clearInterval(retryTimer)
          widthObserver.disconnect()
          columnObserver.disconnect()
          window.removeEventListener('resize', onResize)
          window.removeEventListener('pointerup', onWindowPointerUp)
          window.removeEventListener('pointermove', onPanelPointerMove)
          window.removeEventListener('pointerup', onPanelPointerUp)
          window.removeEventListener('pointercancel', onPanelPointerUp)
          document.removeEventListener('pointerdown', onDocPointerDown, true)
          document.removeEventListener('pointermove', onDocPointerMove, true)
          document.removeEventListener('pointerup', onDocPointerUp, true)
          document.removeEventListener('pointercancel', onDocPointerCancel, true)
          document.removeEventListener('copy', onCopy, true)
          fab.remove()
          panel.remove()
          style.remove()
          hideTag.remove()
          miniTag.remove()
          hideTopTag.remove()
          fontTag.remove()
          fontPickTag.remove()
          fsTag.remove()
          document.removeEventListener('fullscreenchange', syncFullscreen)
          document.documentElement.removeAttribute(FS_ATTR)
          document.documentElement.style.removeProperty('--dsrb-font-base')
          document.documentElement.style.removeProperty('--dsrb-font-scale')
          const t = widthTargets()
          if (t) t.container.style.removeProperty('--dsh-chat-content-width')
        }
        ctx.effect(() => dispose, 'dsh-happy-reader: 实体与监听')
        window.__dsrbDispose = dispose
      } catch (err) {
        // 任何意外都只记日志，不影响应用本体
        console.error('[dsh-happy-reader] 挂载失败：', err)
      }
    }

    // ══ vendored: turndown start ══
    // turndown 7.2.4（MIT License）——逐字内联自官方发行版 dist/turndown.js。
    // 用途：选区复制时把渲染后的 HTML 按社区标准规则映射回 Markdown（不再是手写标签规则）。
    // 官方仓库：https://github.com/mixmark-io/turndown
    /*
MIT License

Copyright (c) 2017 Dom Christie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
    */
var TurndownService = (function () {
  'use strict';

  function extend(destination) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) destination[key] = source[key];
      }
    }
    return destination;
  }
  function repeat(character, count) {
    return Array(count + 1).join(character);
  }
  function trimLeadingNewlines(string) {
    return string.replace(/^\n*/, '');
  }
  function trimTrailingNewlines(string) {
    // avoid match-at-end regexp bottleneck, see #370
    var indexEnd = string.length;
    while (indexEnd > 0 && string[indexEnd - 1] === '\n') indexEnd--;
    return string.substring(0, indexEnd);
  }
  function trimNewlines(string) {
    return trimTrailingNewlines(trimLeadingNewlines(string));
  }
  var blockElements = ['ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS', 'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU', 'NAV', 'NOFRAMES', 'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'];
  function isBlock(node) {
    return is(node, blockElements);
  }
  var voidElements = ['AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT', 'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'];
  function isVoid(node) {
    return is(node, voidElements);
  }
  function hasVoid(node) {
    return has(node, voidElements);
  }
  var meaningfulWhenBlankElements = ['A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT', 'AUDIO', 'VIDEO'];
  function isMeaningfulWhenBlank(node) {
    return is(node, meaningfulWhenBlankElements);
  }
  function hasMeaningfulWhenBlank(node) {
    return has(node, meaningfulWhenBlankElements);
  }
  function is(node, tagNames) {
    return tagNames.indexOf(node.nodeName) >= 0;
  }
  function has(node, tagNames) {
    return node.getElementsByTagName && tagNames.some(function (tagName) {
      return node.getElementsByTagName(tagName).length;
    });
  }
  var markdownEscapes = [[/\\/g, '\\\\'], [/\*/g, '\\*'], [/^-/g, '\\-'], [/^\+ /g, '\\+ '], [/^(=+)/g, '\\$1'], [/^(#{1,6}) /g, '\\$1 '], [/`/g, '\\`'], [/^~~~/g, '\\~~~'], [/\[/g, '\\['], [/\]/g, '\\]'], [/^>/g, '\\>'], [/_/g, '\\_'], [/^(\d+)\. /g, '$1\\. ']];
  function escapeMarkdown(string) {
    return markdownEscapes.reduce(function (accumulator, escape) {
      return accumulator.replace(escape[0], escape[1]);
    }, string);
  }

  var rules = {};
  rules.paragraph = {
    filter: 'p',
    replacement: function (content) {
      return '\n\n' + content + '\n\n';
    }
  };
  rules.lineBreak = {
    filter: 'br',
    replacement: function (content, node, options) {
      return options.br + '\n';
    }
  };
  rules.heading = {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: function (content, node, options) {
      var hLevel = Number(node.nodeName.charAt(1));
      if (options.headingStyle === 'setext' && hLevel < 3) {
        var underline = repeat(hLevel === 1 ? '=' : '-', content.length);
        return '\n\n' + content + '\n' + underline + '\n\n';
      } else {
        return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n';
      }
    }
  };
  rules.blockquote = {
    filter: 'blockquote',
    replacement: function (content) {
      content = trimNewlines(content).replace(/^/gm, '> ');
      return '\n\n' + content + '\n\n';
    }
  };
  rules.list = {
    filter: ['ul', 'ol'],
    replacement: function (content, node) {
      var parent = node.parentNode;
      if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
        return '\n' + content;
      } else {
        return '\n\n' + content + '\n\n';
      }
    }
  };
  rules.listItem = {
    filter: 'li',
    replacement: function (content, node, options) {
      var prefix = options.bulletListMarker + '   ';
      var parent = node.parentNode;
      if (parent.nodeName === 'OL') {
        var start = parent.getAttribute('start');
        var index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + '.  ';
      }
      var isParagraph = /\n$/.test(content);
      content = trimNewlines(content) + (isParagraph ? '\n' : '');
      content = content.replace(/\n/gm, '\n' + ' '.repeat(prefix.length)); // indent
      return prefix + content + (node.nextSibling ? '\n' : '');
    }
  };
  rules.indentedCodeBlock = {
    filter: function (node, options) {
      return options.codeBlockStyle === 'indented' && node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
    },
    replacement: function (content, node, options) {
      return '\n\n    ' + node.firstChild.textContent.replace(/\n/g, '\n    ') + '\n\n';
    }
  };
  rules.fencedCodeBlock = {
    filter: function (node, options) {
      return options.codeBlockStyle === 'fenced' && node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
    },
    replacement: function (content, node, options) {
      var className = node.firstChild.getAttribute('class') || '';
      var language = (className.match(/language-(\S+)/) || [null, ''])[1];
      var code = node.firstChild.textContent;
      var fenceChar = options.fence.charAt(0);
      var fenceSize = 3;
      var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');
      var match;
      while (match = fenceInCodeRegex.exec(code)) {
        if (match[0].length >= fenceSize) {
          fenceSize = match[0].length + 1;
        }
      }
      var fence = repeat(fenceChar, fenceSize);
      return '\n\n' + fence + language + '\n' + code.replace(/\n$/, '') + '\n' + fence + '\n\n';
    }
  };
  rules.horizontalRule = {
    filter: 'hr',
    replacement: function (content, node, options) {
      return '\n\n' + options.hr + '\n\n';
    }
  };
  rules.inlineLink = {
    filter: function (node, options) {
      return options.linkStyle === 'inlined' && node.nodeName === 'A' && node.getAttribute('href');
    },
    replacement: function (content, node) {
      var href = escapeLinkDestination(node.getAttribute('href'));
      var title = escapeLinkTitle(cleanAttribute(node.getAttribute('title')));
      var titlePart = title ? ' "' + title + '"' : '';
      return '[' + content + '](' + href + titlePart + ')';
    }
  };
  rules.referenceLink = {
    filter: function (node, options) {
      return options.linkStyle === 'referenced' && node.nodeName === 'A' && node.getAttribute('href');
    },
    replacement: function (content, node, options) {
      var href = escapeLinkDestination(node.getAttribute('href'));
      var title = cleanAttribute(node.getAttribute('title'));
      if (title) title = ' "' + escapeLinkTitle(title) + '"';
      var replacement;
      var reference;
      switch (options.linkReferenceStyle) {
        case 'collapsed':
          replacement = '[' + content + '][]';
          reference = '[' + content + ']: ' + href + title;
          break;
        case 'shortcut':
          replacement = '[' + content + ']';
          reference = '[' + content + ']: ' + href + title;
          break;
        default:
          var id = this.references.length + 1;
          replacement = '[' + content + '][' + id + ']';
          reference = '[' + id + ']: ' + href + title;
      }
      this.references.push(reference);
      return replacement;
    },
    references: [],
    append: function (options) {
      var references = '';
      if (this.references.length) {
        references = '\n\n' + this.references.join('\n') + '\n\n';
        this.references = []; // Reset references
      }
      return references;
    }
  };
  rules.emphasis = {
    filter: ['em', 'i'],
    replacement: function (content, node, options) {
      if (!content.trim()) return '';
      return options.emDelimiter + content + options.emDelimiter;
    }
  };
  rules.strong = {
    filter: ['strong', 'b'],
    replacement: function (content, node, options) {
      if (!content.trim()) return '';
      return options.strongDelimiter + content + options.strongDelimiter;
    }
  };
  rules.code = {
    filter: function (node) {
      var hasSiblings = node.previousSibling || node.nextSibling;
      var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;
      return node.nodeName === 'CODE' && !isCodeBlock;
    },
    replacement: function (content) {
      if (!content) return '';
      content = content.replace(/\r?\n|\r/g, ' ');
      var extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? ' ' : '';
      var delimiter = '`';
      var matches = content.match(/`+/gm) || [];
      while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + '`';
      return delimiter + extraSpace + content + extraSpace + delimiter;
    }
  };
  rules.image = {
    filter: 'img',
    replacement: function (content, node) {
      var alt = escapeMarkdown(cleanAttribute(node.getAttribute('alt')));
      var src = escapeLinkDestination(node.getAttribute('src') || '');
      var title = cleanAttribute(node.getAttribute('title'));
      var titlePart = title ? ' "' + escapeLinkTitle(title) + '"' : '';
      return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : '';
    }
  };
  function cleanAttribute(attribute) {
    return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
  }
  function escapeLinkDestination(destination) {
    var escaped = destination.replace(/([<>()])/g, '\\$1');
    return escaped.indexOf(' ') >= 0 ? '<' + escaped + '>' : escaped;
  }
  function escapeLinkTitle(title) {
    return title.replace(/"/g, '\\"');
  }

  /**
   * Manages a collection of rules used to convert HTML to Markdown
   */

  function Rules(options) {
    this.options = options;
    this._keep = [];
    this._remove = [];
    this.blankRule = {
      replacement: options.blankReplacement
    };
    this.keepReplacement = options.keepReplacement;
    this.defaultRule = {
      replacement: options.defaultReplacement
    };
    this.array = [];
    for (var key in options.rules) this.array.push(options.rules[key]);
  }
  Rules.prototype = {
    add: function (key, rule) {
      this.array.unshift(rule);
    },
    keep: function (filter) {
      this._keep.unshift({
        filter: filter,
        replacement: this.keepReplacement
      });
    },
    remove: function (filter) {
      this._remove.unshift({
        filter: filter,
        replacement: function () {
          return '';
        }
      });
    },
    forNode: function (node) {
      if (node.isBlank) return this.blankRule;
      var rule;
      if (rule = findRule(this.array, node, this.options)) return rule;
      if (rule = findRule(this._keep, node, this.options)) return rule;
      if (rule = findRule(this._remove, node, this.options)) return rule;
      return this.defaultRule;
    },
    forEach: function (fn) {
      for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
    }
  };
  function findRule(rules, node, options) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (filterValue(rule, node, options)) return rule;
    }
    return undefined;
  }
  function filterValue(rule, node, options) {
    var filter = rule.filter;
    if (typeof filter === 'string') {
      if (filter === node.nodeName.toLowerCase()) return true;
    } else if (Array.isArray(filter)) {
      if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true;
    } else if (typeof filter === 'function') {
      if (filter.call(rule, node, options)) return true;
    } else {
      throw new TypeError('`filter` needs to be a string, array, or function');
    }
  }

  /**
   * The collapseWhitespace function is adapted from collapse-whitespace
   * by Luc Thevenard.
   *
   * The MIT License (MIT)
   *
   * Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   * THE SOFTWARE.
   */

  /**
   * collapseWhitespace(options) removes extraneous whitespace from an the given element.
   *
   * @param {Object} options
   */
  function collapseWhitespace(options) {
    var element = options.element;
    var isBlock = options.isBlock;
    var isVoid = options.isVoid;
    var isPre = options.isPre || function (node) {
      return node.nodeName === 'PRE';
    };
    if (!element.firstChild || isPre(element)) return;
    var prevText = null;
    var keepLeadingWs = false;
    var prev = null;
    var node = next(prev, element, isPre);
    while (node !== element) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
        var text = node.data.replace(/[ \r\n\t]+/g, ' ');
        if ((!prevText || / $/.test(prevText.data)) && !keepLeadingWs && text[0] === ' ') {
          text = text.substr(1);
        }

        // `text` might be empty at this point.
        if (!text) {
          node = remove(node);
          continue;
        }
        node.data = text;
        prevText = node;
      } else if (node.nodeType === 1) {
        // Node.ELEMENT_NODE
        if (isBlock(node) || node.nodeName === 'BR') {
          if (prevText) {
            prevText.data = prevText.data.replace(/ $/, '');
          }
          prevText = null;
          keepLeadingWs = false;
        } else if (isVoid(node) || isPre(node)) {
          // Avoid trimming space around non-block, non-BR void elements and inline PRE.
          prevText = null;
          keepLeadingWs = true;
        } else if (prevText) {
          // Drop protection if set previously.
          keepLeadingWs = false;
        }
      } else {
        node = remove(node);
        continue;
      }
      var nextNode = next(prev, node, isPre);
      prev = node;
      node = nextNode;
    }
    if (prevText) {
      prevText.data = prevText.data.replace(/ $/, '');
      if (!prevText.data) {
        remove(prevText);
      }
    }
  }

  /**
   * remove(node) removes the given node from the DOM and returns the
   * next node in the sequence.
   *
   * @param {Node} node
   * @return {Node} node
   */
  function remove(node) {
    var next = node.nextSibling || node.parentNode;
    node.parentNode.removeChild(node);
    return next;
  }

  /**
   * next(prev, current, isPre) returns the next node in the sequence, given the
   * current and previous nodes.
   *
   * @param {Node} prev
   * @param {Node} current
   * @param {Function} isPre
   * @return {Node}
   */
  function next(prev, current, isPre) {
    if (prev && prev.parentNode === current || isPre(current)) {
      return current.nextSibling || current.parentNode;
    }
    return current.firstChild || current.nextSibling || current.parentNode;
  }

  /*
   * Set up window for Node.js
   */

  var root = typeof window !== 'undefined' ? window : {};

  /*
   * Parsing HTML strings
   */

  function canParseHTMLNatively() {
    var Parser = root.DOMParser;
    var canParse = false;

    // Adapted from https://gist.github.com/1129031
    // Firefox/Opera/IE throw errors on unsupported types
    try {
      // WebKit returns null on unsupported types
      if (new Parser().parseFromString('', 'text/html')) {
        canParse = true;
      }
    } catch (e) {}
    return canParse;
  }
  function createHTMLParser() {
    var Parser = function () {};
    {
      if (shouldUseActiveX()) {
        Parser.prototype.parseFromString = function (string) {
          var doc = new window.ActiveXObject('htmlfile');
          doc.designMode = 'on'; // disable on-page scripts
          doc.open();
          doc.write(string);
          doc.close();
          return doc;
        };
      } else {
        Parser.prototype.parseFromString = function (string) {
          var doc = document.implementation.createHTMLDocument('');
          doc.open();
          doc.write(string);
          doc.close();
          return doc;
        };
      }
    }
    return Parser;
  }
  function shouldUseActiveX() {
    var useActiveX = false;
    try {
      document.implementation.createHTMLDocument('').open();
    } catch (e) {
      if (root.ActiveXObject) useActiveX = true;
    }
    return useActiveX;
  }
  var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();

  function RootNode(input, options) {
    var root;
    if (typeof input === 'string') {
      var doc = htmlParser().parseFromString(
      // DOM parsers arrange elements in the <head> and <body>.
      // Wrapping in a custom element ensures elements are reliably arranged in
      // a single element.
      '<x-turndown id="turndown-root">' + input + '</x-turndown>', 'text/html');
      root = doc.getElementById('turndown-root');
    } else {
      root = input.cloneNode(true);
    }
    collapseWhitespace({
      element: root,
      isBlock: isBlock,
      isVoid: isVoid,
      isPre: options.preformattedCode ? isPreOrCode : null
    });
    return root;
  }
  var _htmlParser;
  function htmlParser() {
    _htmlParser = _htmlParser || new HTMLParser();
    return _htmlParser;
  }
  function isPreOrCode(node) {
    return node.nodeName === 'PRE' || node.nodeName === 'CODE';
  }

  function Node(node, options) {
    node.isBlock = isBlock(node);
    node.isCode = node.nodeName === 'CODE' || node.parentNode.isCode;
    node.isBlank = isBlank(node);
    node.flankingWhitespace = flankingWhitespace(node, options);
    return node;
  }
  function isBlank(node) {
    return !isVoid(node) && !isMeaningfulWhenBlank(node) && /^\s*$/i.test(node.textContent) && !hasVoid(node) && !hasMeaningfulWhenBlank(node);
  }
  function flankingWhitespace(node, options) {
    if (node.isBlock || options.preformattedCode && node.isCode) {
      return {
        leading: '',
        trailing: ''
      };
    }
    var edges = edgeWhitespace(node.textContent);

    // abandon leading ASCII WS if left-flanked by ASCII WS
    if (edges.leadingAscii && isFlankedByWhitespace('left', node, options)) {
      edges.leading = edges.leadingNonAscii;
    }

    // abandon trailing ASCII WS if right-flanked by ASCII WS
    if (edges.trailingAscii && isFlankedByWhitespace('right', node, options)) {
      edges.trailing = edges.trailingNonAscii;
    }
    return {
      leading: edges.leading,
      trailing: edges.trailing
    };
  }
  function edgeWhitespace(string) {
    var m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);
    return {
      leading: m[1],
      // whole string for whitespace-only strings
      leadingAscii: m[2],
      leadingNonAscii: m[3],
      trailing: m[4],
      // empty for whitespace-only strings
      trailingNonAscii: m[5],
      trailingAscii: m[6]
    };
  }
  function isFlankedByWhitespace(side, node, options) {
    var sibling;
    var regExp;
    var isFlanked;
    if (side === 'left') {
      sibling = node.previousSibling;
      regExp = / $/;
    } else {
      sibling = node.nextSibling;
      regExp = /^ /;
    }
    if (sibling) {
      if (sibling.nodeType === 3) {
        isFlanked = regExp.test(sibling.nodeValue);
      } else if (options.preformattedCode && sibling.nodeName === 'CODE') {
        isFlanked = false;
      } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
        isFlanked = regExp.test(sibling.textContent);
      }
    }
    return isFlanked;
  }

  var reduce = Array.prototype.reduce;
  function TurndownService(options) {
    if (!(this instanceof TurndownService)) return new TurndownService(options);
    var defaults = {
      rules: rules,
      headingStyle: 'setext',
      hr: '* * *',
      bulletListMarker: '*',
      codeBlockStyle: 'indented',
      fence: '```',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
      br: '  ',
      preformattedCode: false,
      blankReplacement: function (content, node) {
        return node.isBlock ? '\n\n' : '';
      },
      keepReplacement: function (content, node) {
        return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML;
      },
      defaultReplacement: function (content, node) {
        return node.isBlock ? '\n\n' + content + '\n\n' : content;
      }
    };
    this.options = extend({}, defaults, options);
    this.rules = new Rules(this.options);
  }
  TurndownService.prototype = {
    /**
     * The entry point for converting a string or DOM node to Markdown
     * @public
     * @param {String|HTMLElement} input The string or DOM node to convert
     * @returns A Markdown representation of the input
     * @type String
     */

    turndown: function (input) {
      if (!canConvert(input)) {
        throw new TypeError(input + ' is not a string, or an element/document/fragment node.');
      }
      if (input === '') return '';
      var output = process.call(this, new RootNode(input, this.options));
      return postProcess.call(this, output);
    },
    /**
     * Add one or more plugins
     * @public
     * @param {Function|Array} plugin The plugin or array of plugins to add
     * @returns The Turndown instance for chaining
     * @type Object
     */

    use: function (plugin) {
      if (Array.isArray(plugin)) {
        for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
      } else if (typeof plugin === 'function') {
        plugin(this);
      } else {
        throw new TypeError('plugin must be a Function or an Array of Functions');
      }
      return this;
    },
    /**
     * Adds a rule
     * @public
     * @param {String} key The unique key of the rule
     * @param {Object} rule The rule
     * @returns The Turndown instance for chaining
     * @type Object
     */

    addRule: function (key, rule) {
      this.rules.add(key, rule);
      return this;
    },
    /**
     * Keep a node (as HTML) that matches the filter
     * @public
     * @param {String|Array|Function} filter The unique key of the rule
     * @returns The Turndown instance for chaining
     * @type Object
     */

    keep: function (filter) {
      this.rules.keep(filter);
      return this;
    },
    /**
     * Remove a node that matches the filter
     * @public
     * @param {String|Array|Function} filter The unique key of the rule
     * @returns The Turndown instance for chaining
     * @type Object
     */

    remove: function (filter) {
      this.rules.remove(filter);
      return this;
    },
    /**
     * Escapes Markdown syntax
     * @public
     * @param {String} string The string to escape
     * @returns A string with Markdown syntax escaped
     * @type String
     */

    escape: function (string) {
      return escapeMarkdown(string);
    }
  };

  /**
   * Reduces a DOM node down to its Markdown string equivalent
   * @private
   * @param {HTMLElement} parentNode The node to convert
   * @returns A Markdown representation of the node
   * @type String
   */

  function process(parentNode) {
    var self = this;
    return reduce.call(parentNode.childNodes, function (output, node) {
      node = new Node(node, self.options);
      var replacement = '';
      if (node.nodeType === 3) {
        replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
      } else if (node.nodeType === 1) {
        replacement = replacementForNode.call(self, node);
      }
      return join(output, replacement);
    }, '');
  }

  /**
   * Appends strings as each rule requires and trims the output
   * @private
   * @param {String} output The conversion output
   * @returns A trimmed version of the ouput
   * @type String
   */

  function postProcess(output) {
    var self = this;
    this.rules.forEach(function (rule) {
      if (typeof rule.append === 'function') {
        output = join(output, rule.append(self.options));
      }
    });
    return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '');
  }

  /**
   * Converts an element node to its Markdown equivalent
   * @private
   * @param {HTMLElement} node The node to convert
   * @returns A Markdown representation of the node
   * @type String
   */

  function replacementForNode(node) {
    var rule = this.rules.forNode(node);
    var content = process.call(this, node);
    var whitespace = node.flankingWhitespace;
    if (whitespace.leading || whitespace.trailing) content = content.trim();
    return whitespace.leading + rule.replacement(content, node, this.options) + whitespace.trailing;
  }

  /**
   * Joins replacement to the current output with appropriate number of new lines
   * @private
   * @param {String} output The current conversion output
   * @param {String} replacement The string to append to the output
   * @returns Joined output
   * @type String
   */

  function join(output, replacement) {
    var s1 = trimTrailingNewlines(output);
    var s2 = trimLeadingNewlines(replacement);
    var nls = Math.max(output.length - s1.length, replacement.length - s2.length);
    var separator = '\n\n'.substring(0, nls);
    return s1 + separator + s2;
  }

  /**
   * Determines whether an input can be converted
   * @private
   * @param {String|HTMLElement} input Describe this parameter
   * @returns Describe what it returns
   * @type String|Object|Array|Boolean|Number
   */

  function canConvert(input) {
    return input != null && (typeof input === 'string' || input.nodeType && (input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11));
  }

  return TurndownService;

})();
    // ══ vendored: turndown end ══

    // ══ vendored: turndown-plugin-gfm start ══
    // turndown-plugin-gfm 1.0.2（MIT License）——逐字内联自官方发行版 dist/turndown-plugin-gfm.js。
    // 用途：turndown 的 GFM 扩展（表格 / 删除线 / 任务列表）——它们不在 turndown 核心内。
    // 官方仓库：https://github.com/mixmark-io/turndown-plugin-gfm
    /*
MIT License

Copyright (c) 2017 Dom Christie

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
    */
var turndownPluginGfm = (function (exports) {
'use strict';

var highlightRegExp = /highlight-(?:text|source)-([a-z0-9]+)/;

function highlightedCodeBlock (turndownService) {
  turndownService.addRule('highlightedCodeBlock', {
    filter: function (node) {
      var firstChild = node.firstChild;
      return (
        node.nodeName === 'DIV' &&
        highlightRegExp.test(node.className) &&
        firstChild &&
        firstChild.nodeName === 'PRE'
      )
    },
    replacement: function (content, node, options) {
      var className = node.className || '';
      var language = (className.match(highlightRegExp) || [null, ''])[1];

      return (
        '\n\n' + options.fence + language + '\n' +
        node.firstChild.textContent +
        '\n' + options.fence + '\n\n'
      )
    }
  });
}

function strikethrough (turndownService) {
  turndownService.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: function (content) {
      return '~' + content + '~'
    }
  });
}

var indexOf = Array.prototype.indexOf;
var every = Array.prototype.every;
var rules = {};

rules.tableCell = {
  filter: ['th', 'td'],
  replacement: function (content, node) {
    return cell(content, node)
  }
};

rules.tableRow = {
  filter: 'tr',
  replacement: function (content, node) {
    var borderCells = '';
    var alignMap = { left: ':--', right: '--:', center: ':-:' };

    if (isHeadingRow(node)) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var border = '---';
        var align = (
          node.childNodes[i].getAttribute('align') || ''
        ).toLowerCase();

        if (align) border = alignMap[align] || border;

        borderCells += cell(border, node.childNodes[i]);
      }
    }
    return '\n' + content + (borderCells ? '\n' + borderCells : '')
  }
};

rules.table = {
  // Only convert tables with a heading row.
  // Tables with no heading row are kept using `keep` (see below).
  filter: function (node) {
    return node.nodeName === 'TABLE' && isHeadingRow(node.rows[0])
  },

  replacement: function (content) {
    // Ensure there are no blank lines
    content = content.replace('\n\n', '\n');
    return '\n\n' + content + '\n\n'
  }
};

rules.tableSection = {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: function (content) {
    return content
  }
};

// A tr is a heading row if:
// - the parent is a THEAD
// - or if its the first child of the TABLE or the first TBODY (possibly
//   following a blank THEAD)
// - and every cell is a TH
function isHeadingRow (tr) {
  var parentNode = tr.parentNode;
  return (
    parentNode.nodeName === 'THEAD' ||
    (
      parentNode.firstChild === tr &&
      (parentNode.nodeName === 'TABLE' || isFirstTbody(parentNode)) &&
      every.call(tr.childNodes, function (n) { return n.nodeName === 'TH' })
    )
  )
}

function isFirstTbody (element) {
  var previousSibling = element.previousSibling;
  return (
    element.nodeName === 'TBODY' && (
      !previousSibling ||
      (
        previousSibling.nodeName === 'THEAD' &&
        /^\s*$/i.test(previousSibling.textContent)
      )
    )
  )
}

function cell (content, node) {
  var index = indexOf.call(node.parentNode.childNodes, node);
  var prefix = ' ';
  if (index === 0) prefix = '| ';
  return prefix + content + ' |'
}

function tables (turndownService) {
  turndownService.keep(function (node) {
    return node.nodeName === 'TABLE' && !isHeadingRow(node.rows[0])
  });
  for (var key in rules) turndownService.addRule(key, rules[key]);
}

function taskListItems (turndownService) {
  turndownService.addRule('taskListItems', {
    filter: function (node) {
      return node.type === 'checkbox' && node.parentNode.nodeName === 'LI'
    },
    replacement: function (content, node) {
      return (node.checked ? '[x]' : '[ ]') + ' '
    }
  });
}

function gfm (turndownService) {
  turndownService.use([
    highlightedCodeBlock,
    strikethrough,
    tables,
    taskListItems
  ]);
}

exports.gfm = gfm;
exports.highlightedCodeBlock = highlightedCodeBlock;
exports.strikethrough = strikethrough;
exports.tables = tables;
exports.taskListItems = taskListItems;

return exports;

}({}));
    // ══ vendored: turndown-plugin-gfm end ══

    exports.apply = apply

    return module.exports
  },
})
