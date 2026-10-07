# dsh-sidebar-hud

DSH（DeepSeek Harness）侧边栏 HUD 插件 —— 纯插件实现的左缘悬浮会话面板，**零官方包修改，dsh 升级免疫**。

## 功能

- **左缘热区悬浮**：鼠标碰到窗口左缘 56px 区域（与官方折叠侧栏 rail 同宽），滑出会话面板；鼠标离开 320ms 后自动收回。
- **只显示主会话**：subagent / 子会话行自动过滤，列表干净。
- **状态点**：
  - 🔄 旋转绿点 = 正在运行（含等待审批 / 提问等未结束状态）
  - 🟢 实心绿点 = 运行已结束
  - ⚪ 灰点 = 从未运行过的新会话
- **点击行打开会话**；最近更新优先排序；相对时间标注。

## 安装（git 插件方式）

```bash
# 1. 进入 dsh profile 目录
cd ~/.dsh/profiles/web

# 2. 安装插件（git 源）
pnpm add "dsh-sidebar-hud@github:OakBear/dsh-sidebar-hud"

# 3. 在 package.json 的 dsh.profile.bundles 数组末尾加一行 "dsh-sidebar-hud"

# 4. pnpm install（若第 2 步未自动装好）

# 5. 重启 dsh web，浏览器强刷（Ctrl+Shift+R）
```

> ⚠ pnpm 10/11 对 git 插件 `prepare` 脚本的放行键语义不同（Issue IKJCOC）。
> 若安装时构建被拦，在 `pnpm-workspace.yaml` 的 `allowBuilds` 里加
> `dangerouslyAllowAllBuilds: true`（跨版本通用的最简解）。

本插件**无构建步骤**（client.js 为手写 bundle），`prepare` 只需存在即可，通常不会被拦。

## 技术要点（移植 / 二开必读）

三层打包契约，缺任何一层都是**静默失败**（无报错、无 UI）：

| 层 | 契约 | 缺失后果 |
|---|---|---|
| 图谱组合 | `cordis.patch.yml` 必须有 `- insert` 条目把插件挂进树 | 插件不进组合树，dump-config 里没有 bundle 层头 |
| 模块加载 | `__ModuleLoader__` 的 factory 必须 **`return module.exports`** | loader 拿到 undefined，apply 永不执行 |
| cordis 注入 | 客户端 `inject` 数组只能写**服务名**（如 `"slots"`），不能写包名 | cordis 永远等待不存在的服务，apply 永不执行 |

包的到达顺序（让 `dsh-client-ui-session` 先于本插件物化）由 **package.json 的 `dsh.client.inject`** 声明，与上面客户端代码内的 `inject` 是两个维度。

**核心排查手法**：`dsh --profile web --dump-config` 与正常插件（如 dsh-purge）做差分对照——正常插件会有 `# == <包名>` 的 bundle 层头；缺失即说明卡在组合层，而不是浏览器里盲试。

数据全部来自官方 root hooks（`sessions` / `sessionStatus`，由 `dsh-client-ui-session` 通过 `provideRoot` 提供），字段与官方 WorkspaceBrowser 同源；状态判定复用官方 `sessionStatuses` 语义。「运行已结束」的记忆由插件本地维护（页面生命周期内），因为官方 status 表在未读清零后可能移除条目，无法区分「从未运行」与「运行过已结束」。

## License

MIT
