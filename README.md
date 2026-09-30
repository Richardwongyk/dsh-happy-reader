# Happy Reader（dsh-happy-reader）

DeepSeek Harness 桌面端的阅读增强插件：把对话界面调成适合长时间阅读的样子。
**与官方设置协同，不冲突**——所有调整项都与官方机制同键同步或主动避让，不修改任何官方文件。

## 功能

- **隐藏输入区**：收起底部输入框（保留几何，官方滚动锚定不受影响）
- **隐藏上边栏**：收起会话标题栏（Windows 最上方的系统窗口标题条未触碰）
- **字号**：10–22px 与官方设置直连（两边共进退），超过 22px 用缩放层补齐，最高 40px
- **内容宽度**：官方范围内与官方手柄同键同步；超出官方钳制上限时扩展，一拖官方手柄即交还
- **字体选择**：正文（中文/西文分别选）与代码字体，只列出**本机已装**字体；中英用
  `@font-face(local+unicode-range)` 硬分区互不串扰；三处都选"默认（官方）"时零足迹
- **全屏**：一键铺满屏幕（Esc 退出），开关状态与真实全屏双向同步

界面：窗口内一枚可拖动的 "Aa" 悬浮圆钮，点开面板（标题 **Happy Reader**）即可调；
点面板外任意处关闭。

## 安装

前提：DeepSeek Harness 桌面端（0.2.0-rc.2 验证通过）。

**方式一：官方插件页（推荐）**
设置 → 插件，在安装框按 pnpm 接受的写法输入其一：

- 直接输入包名 `dsh-happy-reader`（发布到 npm 后可用）
- 本地目录：`file:C:/path/to/dsh-happy-reader`
- git 地址：`git+https://github.com/Richardwongyk/dsh-happy-reader.git`

**方式二：命令行**
```sh
dsh plugin --profile <profile> add "git+https://github.com/Richardwongyk/dsh-happy-reader.git"
```

**方式三：手动（老式）**
在 profile 的 `cordis.patch.yml` 末尾追加：
```yaml
- insert:
    - id: dsh-happy-reader
      name: 'file:///C:/path/to/dsh-happy-reader/lib/index.js'
```

> 方式一/二（组合包）与方式三（手动行）**互斥**，同一 profile 只能装其一，否则重复挂载。

## 卸载

- 组合包：插件页里卸载，或 `dsh plugin --profile <profile> remove dsh-happy-reader`
  （升级同理：卸了重装）
- 手动行：删掉 `cordis.patch.yml` 里那三行

卸载后应用完全回到原样（插件不改动官方文件；界面元素与样式由插件自身在卸载时清理）。

## 兼容性与边界

- 开发与验证环境：Windows + DSH 桌面端 0.2.0-rc.2。macOS/Linux 未适配
  （面板定位避让的是 Windows 系统按钮条；字体候选表为中文 Windows 环境向）。
- 插件依赖官方客户端的 DOM 结构与排印 token，DSH 版本升级后可能需要跟版更新。
- 依赖 zero 个第三方运行时包。

## 命名说明

包名 `dsh-happy-reader`（`dsh-` 前缀便于在 DSH 插件生态里被识别），
显示名 **Happy Reader**。历史版本曾用名 `dsh-reader-boost`；本地设置存储键
自始未变（`dsh.reader-boost.v1`），更名不影响既有设置。

## 许可

MIT（见 LICENSE）。本插件为第三方作品，与 DeepSeek 官方无隶属关系。
