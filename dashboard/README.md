# Mote Relay Dashboard

Relay 的管理员界面。生产环境由 Mote Relay 静态托管，不是单独的服务器或容器。

页面：

```text
/                    Overview
/devices             Devices（含待批准配对）
/devices/:id         Device detail
/tokens              Tokens
/activity            Activity
/settings            Settings · Profile
/settings/account    Settings · Account
/settings/relay      Settings · Relay
```

未登录时显示 Login。没有注册、邮件找回或 OAuth。第一个管理员用 Relay CLI 创建。

## 技术栈

- React 19、TypeScript、Vite
- React Router
- shadcn/ui + Tailwind
- 颜色 token 对齐仓库根目录 [design.md](../design.md)

## 本地开发

先开 Relay，再开 Vite：

```text
# Terminal 1
cd relay
npm run dev

# Terminal 2
cd dashboard
npm install
npm run dev
```

Vite 在 `http://127.0.0.1:5173`，并把 `/admin/api`、`/v1`、`/health`、`/ready` 代理到 `http://127.0.0.1:3000`。`/admin/api` 的代理超时已关闭，以便 `GET /admin/api/events`（SSE）保持长连接。管理员 cookie 走同一浏览器源。

```text
npm run typecheck
npm test
npm run build
```

`npm run build` 写出 `dashboard/dist`。Docker 镜像把它拷进 Relay 容器。不要在生产环境跑 Vite。

## 实时刷新

登录后 `AuthenticatedLayout` 用 `EventSource("/admin/api/events", { withCredentials: true })` 订阅 topic。Relay 只通知「哪类数据变了」，页面再拉现有 REST。SSE 正常时兜底轮询 30 秒；断线回到原来的 5–8 秒（有待批准配对时 2 秒）。设置页的系统信息不订阅。

## 配对

1. Mac 点 **Pair**。
2. **Devices** 出现 pending 请求。
3. **Allow** 后明文设备凭据只显示这一次；Mac 会经配对 WebSocket 自动写入钥匙串。
4. **Deny** 或超时后，Mac 收到 `pair_rejected` / `pair_expired`。

## 发令

设备详情可以从 Dashboard 发送 `lock`。这条活动记为 `source = dashboard`，与快捷指令的 `shortcut` 分开。`ios` 已在标签里预留，等原生客户端接入。

## 不要做的事

- 不要把新创建的 token 或设备凭据写入 `localStorage` / `sessionStorage`
- 不要单独部署一套 Dashboard 主机名
- 不要在生产跑 `npm run dev`
