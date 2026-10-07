// dsh-sidebar-hud client bundle: 左缘悬浮会话面板（纯插件，零官方包修改）。
//
// ## 工作原理（全部来自官方包逆向确认，2026-10）
//
// 1. 挂载点：`shell.overlay` 是 root scope 的 **list 槽**
//    （dsh-client-ui-layout/lib/client.js：
//      `"shell.overlay": { kind: "list", scope: "root" }`），
//    渲染进 AppFrame 的 overlayLayer：
//      `.overlayLayer{position:absolute;inset:0;z-index:20;pointer-events:none}`
//      `.overlayLayer>*{pointer-events:auto}` —— 直接子元素自动可交互，
//    其余区域点击穿透。additive、不遮蔽他人，多个插件可共存。
//    ⚠ 绝不注册 `root` 槽（single 槽，注册即遮蔽整个 AppFrame）。
//
// 2. 数据：官方 root hooks。`dsh-client-ui-session` 通过
//    `ctx.slots.provideRoot({ hooks: { sessions: ctx.sessions.list, sessionStatus } })`
//    提供两个标准源；槽渲染层把它们经 `standardHookPropName`（`use` + 首字母大写）
//    注入条目组件 props —— 即 `useSessions` / `useSessionStatus`。
//    - `useSessions(snapshot => …)`：`{ ids: string[], byId: {id, displayTitle,
//      running, retainedBy: {mainView?}, parentId?, origin?}, phase }`
//    - `useSessionStatus(map => …)`：`Map<sessionId, {running,
//      pendingInteraction, completionUnread}>`
//    这正是官方 WorkspaceBrowser 消费同一批数据的方式（字段同源）。
//
// 3. 状态映射（与官方 sessionStatuses 同判据）：
//    running → ongoing（旋转绿点）；pendingInteraction → warning；
//    completionUnread（完成未读）→ done；其余 → idle。
//
// 4. 打开会话：`ctx.get("uiWorkspace").openSession(id)`
//    （dsh-client-ui-workspace 的 UiWorkspaceService，better-sidebar 同款调用）。
//
// 5. 交互：左侧 10px 热区悬浮 → 展开面板；指针离开面板 → 320ms 后收回。
//    官方侧栏保持常折叠，本面板独立存在，二者不冲突。

window.__ModuleLoader__.load({ id: "dsh-sidebar-hud", factory: (require) => {

  var module = { exports: {} };
  var exports = module.exports;

  const react = require("react");
  const h = react.createElement;
  const { useState, useEffect, useRef, useCallback, useMemo } = react;

  const name = "dsh-sidebar-hud";
  // ⚠ 这里是 cordis **服务名**注入，不是包名——写包名会让 cordis 永远等待
  // 一个不存在的服务，apply 永不执行，面板静默消失（首版踩过的坑）。
  // 包的到达顺序（ui-session / ui-workspace bundle 先物化）由 package.json
  // 的 `dsh.client.inject` 声明负责，两者分工不同。
  // slots：注册 shell.overlay 条目。root hooks（sessions/sessionStatus）由
  // dsh-client-ui-session 的 provideRoot 全局提供，无需额外服务注入。
  const inject = ["slots"];

  // ── 常量 ────────────────────────────────────────────────────────────────

  const NS = "dsh-sidebar-hud";
  const COLLAPSE_DELAY_MS = 320;        // 指针离开后收回的延迟
  const PANEL_WIDTH = 264;              // 面板宽度（px）
  const EDGE_HOTZONE = 56;             // 左缘热区宽度（px）：与官方折叠 rail 同宽（dsh-client-ui-sidebar 折叠列为 56px）
  const MAX_ROWS = 60;                  // 最多渲染的会话行数（超出截断）

  // ── 样式（一次性注入，类名带插件前缀避免冲突）──────────────────────────

  const CSS = `
.${NS}-host{position:absolute;top:0;bottom:0;left:0;width:0;pointer-events:none;font:12px/1.5 var(--dsw-font-sans,system-ui,sans-serif)}
.${NS}-zone{position:absolute;top:0;bottom:0;left:0;width:${EDGE_HOTZONE}px;pointer-events:auto;cursor:default}
.${NS}-panel{position:absolute;top:0;bottom:0;left:0;width:${PANEL_WIDTH}px;pointer-events:auto;display:flex;flex-direction:column;
  background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#1b1b22));
  border-right:1px solid var(--dsw-alias-stroke-default,#ffffff14);
  box-shadow:0 10px 40px -12px #0003,0 2px 12px -4px #0002;
  animation:${NS}-in .24s var(--ds-ease-in-out,ease-in-out);overflow:hidden}
@keyframes ${NS}-in{0%{opacity:0;transform:translateX(-8px)}}
.${NS}-head{display:flex;align-items:center;gap:6px;padding:10px 12px 8px;flex:none;
  color:var(--dsw-alias-label-secondary,#ffffff99);font-weight:600;letter-spacing:.02em}
.${NS}-list{flex:1;overflow-y:auto;padding:0 6px 10px}
.${NS}-row{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:6px;
  background:transparent;color:var(--dsw-alias-label-primary,#ffffffd9);text-align:left;cursor:pointer;
  font:inherit;white-space:nowrap;overflow:hidden}
.${NS}-row:hover{background:var(--dsw-alias-fill-hover,#ffffff0f)}
.${NS}-row[data-current="true"]{background:var(--dsw-alias-fill-active,#ffffff1a)}
.${NS}-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.${NS}-empty{padding:14px 12px;color:var(--dsw-alias-label-tertiary,#ffffff66)}
.${NS}-dot-run{width:14px;height:14px;flex:none}
.${NS}-dot-run svg{width:100%;height:100%;animation:${NS}-spin 1s linear infinite}
.${NS}-dot-run circle{fill:none;stroke:var(--dsw-alias-state-success-primary,#4ade80);stroke-width:2.6;stroke-linecap:round}
@keyframes ${NS}-spin{to{transform:rotate(360deg)}}
.${NS}-dot{width:10px;height:10px;flex:none;border-radius:50%}
.${NS}-dot[data-state="done"]{background:var(--dsw-alias-state-success-primary,#4ade80)}
.${NS}-dot[data-state="warning"]{background:var(--dsw-alias-state-warning-primary,#fbbf24)}
.${NS}-dot[data-state="idle"]{background:var(--dsw-alias-fill-hover,#ffffff2e)}
`;

  function installStyles() {
    if (document.getElementById(NS + "-styles")) return;
    const el = document.createElement("style");
    el.id = NS + "-styles";
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // ── 状态点（ongoing 旋转 / done 绿 / warning 黄 / idle 灰）─────────────

  function HudDot({ state }) {
    if (state === "ongoing") {
      return h("span", { className: NS + "-dot-run", "aria-label": "running" },
        h("svg", { viewBox: "0 0 24 24", "aria-hidden": true },
          h("circle", { cx: 12, cy: 12, r: 9.5 })));
    }
    return h("span", { className: NS + "-dot", "data-state": state, "aria-hidden": true });
  }

  // 「运行过」记忆：sessionStatus 在会话结束且未读清零后可能移除条目，
  // 无法区分「从未运行」与「运行过已结束」。插件自己记录见过的 running 会话
  // （页面生命周期内有效——刷新后重置可接受，会话列表本来也会重排）。
  const everRan = new Set();

  // 状态判定（用户定稿 2026-10-07：只显示旋转与绿点两态）：
  //   ongoing = 正在运行或等待交互（审批/提问等未结束状态，旋转）
  //   done    = 运行已结束（实心绿点）——本页生命周期内见过 running=true，
  //             或 completionUnread 未读。
  //   idle    = 从未运行过的会话（灰点，新会话默认态）。
  function statusOf(row, status) {
    const s = status instanceof Map ? status.get(row.id) : undefined;
    if (row.pendingInteraction || (s && s.pendingInteraction)) { everRan.add(row.id); return "ongoing"; }
    if (row.running || (s && s.running)) { everRan.add(row.id); return "ongoing"; }
    if (s && s.completionUnread) return "done";
    if (everRan.has(row.id)) return "done";
    return "idle";
  }

  // ── 面板主体 ────────────────────────────────────────────────────────────

  function HudPanel({ useSessions, useSessionStatus, onOpen }) {
    const list = useSessions((state) => state);
    const status = useSessionStatus((map) => map);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), 30_000);
      return () => clearInterval(timer);
    }, []);

    const { rows, currentId, total } = useMemo(() => {
      const byId = list.byId ?? {};
      const currentId = Object.values(byId).find((row) => (row.retainedBy?.mainView ?? 0) > 0)?.id;
      // ⚠ 只要主会话：带 parentId 的行（含 origin === "subagent" 的投影行）一律不显示。
      const roots = [];
      for (const id of list.ids ?? []) {
        const row = byId[id];
        if (!row) continue;
        if (row.parentId && byId[row.parentId]) continue;  // subagent / 子会话：过滤
        roots.push(row);
      }
      // 最近更新优先（官方同序）
      roots.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      return { rows: roots.slice(0, MAX_ROWS), currentId, total: (list.ids ?? []).length };
    }, [list]);

    const relTime = useCallback((ts) => {
      if (!ts) return "";
      const diff = Math.max(0, now - ts);
      const min = Math.floor(diff / 60_000);
      if (min < 1) return "now";
      if (min < 60) return min + "m";
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + "h";
      return Math.floor(hr / 24) + "d";
    }, [now]);

    const rowEl = (row) => h("button", {
      key: row.id,
      type: "button",
      role: "listitem",
      className: NS + "-row",
      "data-current": row.id === currentId ? "true" : "false",
      onClick: () => onOpen(row.id),
    },
      h(HudDot, { state: statusOf(row, status) }),
      h("span", { className: NS + "-title" }, row.displayTitle ?? row.id),
      h("span", { style: { opacity: .5, flex: "none" } }, relTime(row.updatedAt)));

    return h("div", { className: NS + "-panel" },
      h("div", { className: NS + "-head" }, "Sessions",
        total > MAX_ROWS ? h("span", { style: { fontWeight: 400, opacity: .6 } }, ` (${total})`) : null),
      h("div", { className: NS + "-list", role: "list" },
        rows.length === 0
          ? h("div", { className: NS + "-empty" }, "No sessions")
          : rows.map((row) => rowEl(row, false))));
  }

  // ── 外壳：热区 + 悬浮状态机 ─────────────────────────────────────────────

  function HudHost({ useSessions, useSessionStatus, onOpen }) {
    const [open, setOpen] = useState(false);
    const collapseTimer = useRef(null);

    const armCollapse = useCallback(() => {
      if (collapseTimer.current !== null) clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(() => {
        collapseTimer.current = null;
        setOpen(false);
      }, COLLAPSE_DELAY_MS);
    }, []);

    const cancelCollapse = useCallback(() => {
      if (collapseTimer.current !== null) {
        clearTimeout(collapseTimer.current);
        collapseTimer.current = null;
      }
    }, []);

    // 卸载清理：不留悬挂计时器
    useEffect(() => () => {
      if (collapseTimer.current !== null) clearTimeout(collapseTimer.current);
    }, []);

    return h("div", { className: NS + "-host" },
      h("div", {
        className: NS + "-zone",
        onPointerEnter: () => { cancelCollapse(); setOpen(true); },
        // 热区离开（未进入面板）→ 直接计时收回
        onPointerLeave: () => { if (open) armCollapse(); },
      }),
      open ? h("div", {
        onPointerEnter: cancelCollapse,
        onPointerLeave: armCollapse,
      }, h(HudPanel, { useSessions, useSessionStatus, onOpen })) : null);
  }

  // ── 注册 ────────────────────────────────────────────────────────────────

  function apply(ctx) {
    ctx.effect(() => installStyles(), NS + ": styles");

    // 打开会话：官方 UiWorkspaceService；缺失时降级 sessions 控制器。
    const openSession = (sessionId) => {
      try {
        const workspace = ctx.get("uiWorkspace");
        if (workspace && typeof workspace.openSession === "function") {
          workspace.openSession(sessionId);
          return;
        }
      } catch {}
      try {
        ctx.get("sessions")?.open?.(sessionId);
      } catch {}
    };

    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: NS + ".panel",
      order: 900,  // 排在官方 overlay 条目之后，不影响其渲染
      // root scope 槽的标准源自动经 useSessions / useSessionStatus 注入
    }, (props) => h(HudHost, { ...props, onOpen: openSession })));
  }

  // ⚠ factory 必须把模块对象 **return** 出去——loader 以 factory 返回值为准。
  // 少了这句 loader 拿到 undefined，apply 永不执行，面板静默消失（第二个坑）。
  module.exports = { name, inject, apply };
  return module.exports;

}});






