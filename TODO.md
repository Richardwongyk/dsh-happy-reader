# Happy Reader 待办与已知冲突

## 1. 官方右键/快捷键“复制”与 Markdown 复制拦截的冲突（未解决，v0.3.1 记录）

### 事实

- DSH 桌面端右键看到的“复制”是 **Electron 主进程原生菜单**：`lib/main.js` 的
  `webContents.on("context-menu")` 在 `selectionText` 非空时只加入
  `{ role: "copy" }`，再 `Menu.buildFromTemplate(...).popup({ window })`。
- 该原生菜单没有插件扩展点；客户端插件（渲染层）拿不到它，也不能往里面注册菜单项。
- DSH 另有可扩展的网页右键菜单（`contextMenu.content` / `ctx.contextMenus`），
  但它面向会话、工作区、标签页等带类型的目标，聊天文字右键不走它。
- Happy Reader 目前在 `document` 捕获阶段监听 `copy`：选区两端都在消息行
  `[data-chat-node-key]` 内且不在可编辑区时，改写为 Markdown 并 `preventDefault()`。
  因此官方右键“复制”和 Ctrl+C 在聊天正文里都会输出 Markdown（而不是官方纯文本）。
- 官方消息右上角的复制按钮走 `navigator.clipboard.writeText`，复制纯文本，
  不经过 DOM `copy` 事件，不受影响。
- 官方选区扩展点是 `conversation.chat.text-interaction`（`uiConversation.interactions`
  + keyed slot），官方目前只注册了 `message-quotes` 的“引用文本”动作；该槽位一次
  只展示一个动作，不是多按钮菜单。
- 官方文档要求：扩展点共享、用最弱机制、不要替换宿主行为；当前全局 copy 拦截
  属于强覆盖，不是官方扩展点。

### 可选方向

1. **官方路线**：移除全局 copy 拦截，注册 `conversation.chat.text-interaction`
   动作“复制为 Markdown”，把 Ctrl+C / 右键“复制”交还官方纯文本。
   代价：与“引用文本”争用同一个单动作面；Markdown 转换需要点击时自行读取
   `document.getSelection()`（官方只提供 `readText()` 纯文本）。
2. **仅键盘路径**：只对 Ctrl+C 改写，官方右键菜单复制保持纯文本。
   代价：需要 keydown 标记等启发式区分，不是官方 API，边界不完全可靠。
3. **显式配置**：增加“复制为 Markdown / 官方纯文本”设置，默认尊重官方，
   用户明确开启才拦截。仍是强覆盖，但行为透明。
4. **等待上游**：等 DSH 为主进程原生右键菜单提供插件 hook 后再加
   “复制为 Markdown”菜单项。当前 0.2.2 没有此接口。

### 结论

在官方提供原生菜单 hook 之前，无法“在右键‘复制’旁边注册一项”。当前版本保留
全局拦截作为功能实现，但这是已知偏差；后续若严格对齐官方文档，应优先采用方向 1。
