# 安全

Mote 是一套动作允许列表封闭的远程动作系统。它不是远程 shell，也绝不能变成远程 shell。

Mote for Mac 把 `device_connection` 凭据存放在钥匙串。Mote Relay 只保存设备凭据和快捷指令 token 的 SHA-256 哈希。

这是个人工具。它不是零信任，也不声称自己是密码学产品。

## 凭据角色

存在三种互不兼容的身份。服务器按存储位置强制角色，而不是由客户端自行声明角色。管理员会话不能使用 Shortcut token 或设备凭据。

### 快捷指令凭据

权限：

```text
send_command
```

仅供 Apple 快捷指令或未来受信任的命令客户端使用。iPhone 配置见 [shortcuts.md](shortcuts.md)。

请求头：

```http
Authorization: Bearer <shortcut-token>
```

不要把 token 放进查询字符串、URL fragment 或 cookie。

该凭据可以为已知设备创建命令。它不得用于认证设备 WebSocket。

### Mac 设备凭据

权限：

```text
device_connection
```

仅供 Mote Agent 认证其 WebSocket 连接。

该凭据可以把一台 Mac 挂到 Mote Relay，并接收发给该设备的命令。它不得被接受为快捷指令/命令客户端凭据。

在设备 WebSocket 上出示 `send_command` 密钥会被拒绝。在命令 HTTP 路径上出示 `device_connection` 密钥会被拒绝。这两种凭据都不能登录 Dashboard。

### 管理员账户

Dashboard 使用独立的 `admins` 表，而不是 Bearer token。

- 密码用 Argon2id 哈希（`@noble/hashes`，编码串含盐与参数）。不使用单独的 SHA-256、明文或 MD5。
- 浏览器只收到随机会话 token，放在 `mote_admin_session` HttpOnly cookie 中。服务端只保存 SHA-256 哈希。
- Cookie：`HttpOnly`、生产环境 `Secure`、`SameSite=Lax`、`Path=/`，默认 7 天。
- 状态改变的 `/admin/api/*` 请求还要校验 Origin / Referer，以及 JSON `Content-Type`。
- 登录按来源每分钟最多 5 次。
- 新设备凭据和 Shortcut token 只在创建或轮换时返回一次。Dashboard 不把它们写入 `localStorage` 或 `sessionStorage`。
- 管理员创建与密码恢复只通过 CLI。没有注册、邮件找回或 OAuth。
- 命令活动只保留最近 10,000 条。`duration_ms` 是命令从创建到完成的墙钟时间，不是心跳 RTT。

## Token 处理

- 密钥是长的、密码学随机值（`crypto.randomBytes`）。
- Relay 只持久化 SHA-256 十六进制摘要。
- 校验时对出示的密钥做哈希，再用 `timingSafeEqual` 比较摘要。
- CLI 只打印一次密钥，且永不写入源文件。
- 日志使用 `device_id`、`command_id`、`token_id` 和 `pair_request_id`。不得包含 Bearer token、设备凭据、`pair_secret` 或 Authorization 头。
- 配对请求只保存 `pair_secret` 的 SHA-256 哈希。设备明文凭据在批准时生成，推给配对 WebSocket，不入库。
- 公开 `POST /v1/pair/requests` 按 IP 与 `device_id` 限流。错误的 `pair_secret` 不能领取凭据。
- `GET /s/:deviceId` 是公开安装页：只带 Device ID 和命令 URL，不带 token，也不展示设备是否在线。

## 传输

- 生产环境仅使用 HTTPS 和 WSS。
- 公网主机名是 `relay.yanze.me`。
- 客户端始终使用 `https://relay.yanze.me` 和 `wss://relay.yanze.me/v1/ws/device`。Cloudflare Tunnel 不得改变这些安全 URL。
- 开发可以使用 `http://127.0.0.1:3000` 和 `ws://127.0.0.1:3000/v1/ws/device`。
- 不要把 Mac 或快捷指令改成访问 `http://192.168.2.44:3000`。该地址只是 PVE 宿主机上 `cloudflared` 的源站。
- Mac 生产代码永不关闭 TLS 校验。

## 命令完整性

- Relay 生成命令的 `id`、`created_at`、`expires_at` 和 `nonce`。快捷指令不提供这些字段。
- 默认 TTL 为 10 秒。
- 离线命令立即拒绝，永不排队。
- 重复命令 ID 由 Mac 的近期 ID 缓存拒绝。Relay 的 pending 条目只 resolve 一次。
- 未知以及已预留但未实现的动作会被拒绝。
- WebSocket 设备必须先认证才能接收命令。
- 未认证套接字会在认证超时后关闭（Relay 默认 5 秒）。超时关闭不发送 `invalid_credentials`，以便 Mac 重连。

## 执行边界

Mote Agent 只能运行预定义的本地动作（V1 为 `lock`）。

Mote Relay 转发允许列表中的命令。它不会替客户端执行操作系统命令。

禁止：

- 远程任意 shell 执行
- 客户端提供的可执行路径
- 客户端提供的 AppleScript
- 把 Mote Relay 当作通用远程代码执行系统

## HTTP 防护

- JSON 正文上限（默认 16 KiB）
- 内存中的命令速率限制（默认每 token 每 10 秒 10 次）
- 没有宽松 CORS（未启用 `Access-Control-Allow-Origin: *`）
- 机器 API 不使用浏览器会话 cookie
- Dashboard 使用 HttpOnly 管理员会话 cookie；`/admin/api/*` 响应为 `Cache-Control: no-store`
- 登录有独立的内存速率限制
- HTML 响应带有 CSP、`X-Content-Type-Options`、`Referrer-Policy` 和 `frame-ancestors 'none'`

## 部署说明

- 在家和外出都走同一条 Cloudflare Tunnel，终止在同一 Mote Relay 实例。V1 不使用 Split DNS。
- `cloudflared` 运行在 PVE 宿主机上。Mote LXC / Compose 不持有 Tunnel token，也不调用 Cloudflare API。
- 不要在 Mote V1 前面放交互式 Cloudflare Access。快捷指令的 Bearer `send_command` token、Mac 的 `device_connection` 凭据，以及 Dashboard 管理员会话已经负责认证。交互式登录会干扰快捷指令和持久 WebSocket。
- 把 `192.168.2.44:3000` 发布到家庭 LAN 并不削弱 Relay 认证。Bearer、设备 WebSocket 认证、凭据角色分离、命令允许列表、速率限制、TTL、无命令队列和重复保护全部保留。健康检查可以保持当前的未认证设计。
- Compose 文件和文档只使用环境变量占位符。不要把 Cloudflare 密钥放进 Mote 部署。
- 管理 CLI 不得暴露到公网。
