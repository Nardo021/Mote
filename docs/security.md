# 安全

Mote 是一套动作允许列表封闭的远程动作系统。它不是远程 shell，也绝不能变成远程 shell。

Mote for Mac 把 `device_connection` 凭据存放在钥匙串。Mote Relay 只保存设备凭据和快捷指令 token 的 SHA-256 哈希。

这是个人工具。它不是零信任，也不声称自己是密码学产品。

## 凭据角色

存在两种凭据角色。它们不可互换。服务器按存储位置强制角色，而不是由客户端自行声明角色。

### 快捷指令凭据

权限：

```text
send_command
```

仅供 Apple 快捷指令或未来受信任的命令客户端使用。

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

在设备 WebSocket 上出示 `send_command` 密钥会被拒绝。在命令 HTTP 路径上出示 `device_connection` 密钥会被拒绝。

## Token 处理

- 密钥是长的、密码学随机值（`crypto.randomBytes`）。
- Relay 只持久化 SHA-256 十六进制摘要。
- 校验时对出示的密钥做哈希，再用 `timingSafeEqual` 比较摘要。
- CLI 只打印一次密钥，且永不写入源文件。
- 日志使用 `device_id`、`command_id` 和 `token_id`。不得包含 Bearer token、设备凭据或 Authorization 头。

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
- 没有浏览器会话 cookie

## 部署说明

- 在家和外出都走同一条 Cloudflare Tunnel，终止在同一 Mote Relay 实例。V1 不使用 Split DNS。
- `cloudflared` 运行在 PVE 宿主机上。Mote LXC / Compose 不持有 Tunnel token，也不调用 Cloudflare API。
- 不要在 Mote V1 前面放交互式 Cloudflare Access。快捷指令的 Bearer `send_command` token 和 Mac 的 `device_connection` 凭据已经负责认证。交互式登录会干扰快捷指令和持久 WebSocket。
- 把 `192.168.2.44:3000` 发布到家庭 LAN 并不削弱 Relay 认证。Bearer、设备 WebSocket 认证、凭据角色分离、命令允许列表、速率限制、TTL、无命令队列和重复保护全部保留。健康检查可以保持当前的未认证设计。
- Compose 文件和文档只使用环境变量占位符。不要把 Cloudflare 密钥放进 Mote 部署。
- 管理 CLI 不得暴露到公网。
