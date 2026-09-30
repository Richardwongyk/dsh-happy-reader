// dsh-happy-reader（Happy Reader）—— 宿主（Node）半边
//
// 宿主侧当前不做任何事：本文件只需能被应用加载器成功导入。
// 浏览器半边（lib/client.js）由应用启动扫描按 package.json 的 dsh.client
// 声明自动发现，无需任何额外注册。

export const name = 'dsh-happy-reader'

export function apply() {
  // 加载即打印一行，便于在宿主侧诊断里确认插件被加载（不影响任何功能）
  console.log('[dsh-happy-reader] 宿主半边已加载')
}
