// dsh-sidebar-hud 宿主侧入口：极简占位。
//
// 本插件的功能全部在浏览器端（client.js）：左缘悬浮会话面板。
// 宿主侧唯一要做的事是「作为 bundle 参与组合」——cordis 加载器要求
// bundle 包有一个可加载的入口（lib/index.js，由 package.json 的 main 指向），
// 且 exports["./client"] 指向浏览器 bundle（client.js）。
//
// ⚠ 不声明宿主 inject / 不注册宿主服务：任何多余行为都可能影响宿主启动。

export const name = 'dsh-sidebar-hud'

export function apply() {
  // 宿主侧无行为：纯客户端插件。
}
