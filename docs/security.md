# 安全

Mote 是一套动作允许列表封闭的远程动作系统。它不是远程 shell，也绝不能变成远程 shell。

Mote for Mac 把 `device_connection` 凭据存放在钥匙串。当前 service 是 `com.nardo021.mote`，account 是 `device_connection`。项使用 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`，解密 ACL 只给创建它的应用，不向任意本地应用开放。Mote 可以写入、读取、轮换和删除自己的凭据。如果读到旧版本故意放宽的项，会在这次读取时删掉并按当前进程的默认 ACL 重写，明文不进日志。

Bundle ID 从占位符 `com.example.mote` 换成 `com.nardo021.mote` 时，读取顺序是：新 service，没有再读旧 service。旧项能读出来时，先用当前 ACL 写入新 service，读回一致后才删除旧项。新写入或读回失败则保留旧项，并继续使用读到的凭据。迁移不扫描无关钥匙串项，也不把凭据写进日志。`device_id` 从旧偏好域抄到新域（只补缺失键），避免换 Bundle ID 之后变成另一台设备。

仓库默认 Ad-hoc 签名，Team ID 不入库。Ad-hoc 构建的 cdhash 每次都会变，重新构建可能弹出钥匙串提示。稳定的 Development Team 或 Developer ID 让同一把钥匙串身份跨构建保持不变。不要为了消掉这个提示而恢复任意进程可读的 ACL。应用沙盒保持关闭：锁屏依赖私有 `SACLockScreenImmediate` 和 `CGEvent` 回退，登录项就是这个菜单栏应用。沙盒策略和凭据 ACL 是两件事。

Mote for Windows 的设备凭据不进 `%LOCALAPPDATA%\Mote\settings.json`，也不进注册表。生产存储是 Windows Credential Manager，类型 `CRED_TYPE_GENERIC`，TargetName 为 `com.nardo021.mote/device_connection`。读写走 `CredWriteW` / `CredReadW` / `CredDeleteW` / `CredFree`。原生调用失败就失败，不改写到设置、注册表明文或别的文件。单元测试只用 `com.nardo021.mote.test/<uuid>`。端到端测试只用 `com.nardo021.mote.e2e/<uuid>`，跑完删除。两者都不写生产 TargetName。网络中断和系统休眠不会删除这条凭据，也不会改掉用户的连接意愿。设置窗口里替换凭据时，明文只经过 Credential Manager，不进 `settings.json`，也不进日志。登录启动只写当前用户的 Run 键，命令带 `--background`。Windows 锁屏只走 `LockWorkStation()`，不走 shell 或 PowerShell。端到端测试在这个 API 之前换成替身，不锁当前会话。

Windows 打包没有加遥测，也没有加 Windows 服务或管理员权限。Agent 仍然只连接用户配置的 Relay。`lock` 仍是唯一允许的动作。Authenticode 只能说明这个文件来自某个签名身份、并且签完以后没被改过。它不证明 Relay、配对或设备凭据可以被信任，也不能代替 Protocol v1 的认证。未签名和测试自签的包都是开发产物。签名也不能保证 SmartScreen 不提示；新的直接下载程序即使签过名，也可能还要积累信誉。不要为了安装 Mote 去关掉系统的安全保护。

Mote Relay 只保存设备凭据和快捷指令 token 的 SHA-256 哈希。

这是个人工具。它不是零信任，也不声称自己是密码学产品。

## 凭据角色

存在三种互不兼容的身份。服务器按存储位置强制角色，而不是由客户端自行声明角色。管理员会话不能使用 Shortcut token 或设备凭据。

### 快捷指令凭据

权限：

```text
send_command
```

仅供 Apple 快捷指令使用。`client_kind` 只有 `shortcut`。公开命令 API 的活动来源固定写成 `shortcut`，不接受请求体里自报的来源。每个 token 绑定恰好一台设备的 `device_id`。它只能查询和命令这台设备。旧的未绑定设备、或绑定了多台设备的 `send_command` token，在迁移时会被停用，不能重新启用成全局 token；需要为指定设备新建。明文仍然只显示一次。iPhone 快捷指令见 [shortcuts.md](shortcuts.md)。

请求头：

```http
Authorization: Bearer <shortcut-token>
```

不要把 token 放进查询字符串、URL fragment 或 cookie。

该凭据可以为已知设备创建命令。它不得用于认证设备 WebSocket。

### 设备凭据

权限：

```text
device_connection
```

仅供 Mote Agent 认证其 WebSocket 连接。

该凭据可以把一台 Mac 或 Windows Agent 挂到 Mote Relay，并接收发给该设备的命令。Windows 把它放在 Credential Manager 的 `device_connection` 目标里。它不得被接受为快捷指令/命令客户端凭据。

在设备 WebSocket 上出示 `send_command` 密钥会被拒绝。在命令 HTTP 路径上出示 `device_connection` 密钥会被拒绝。这两种凭据都不能登录 Dashboard。

### 管理员账户

Dashboard 使用独立的 `admins` 表，而不是 Bearer token。

- 密码用 Argon2id 哈希（`@noble/hashes`，编码串含盐与参数）。不使用单独的 SHA-256、明文或 MD5。
- 浏览器只收到随机会话 token，放在 `mote_admin_session` HttpOnly cookie 中。服务端只保存 SHA-256 哈希。
- Cookie：`HttpOnly`、生产环境 `Secure`、`SameSite=Lax`、`Path=/`，默认 7 天。
- 状态改变的 `/admin/api/*` 请求还要校验 Origin / Referer，以及 JSON `Content-Type`。`GET /admin/api/events`（SSE）只读，不受该 CSRF 钩子限制，但仍要管理员 cookie。
- 登录按来源每分钟最多 5 次。
- 新设备凭据和 Shortcut token 只在创建或轮换时返回一次。Dashboard 不把它们写入 `localStorage` 或 `sessionStorage`。
- 首次管理员在数据库还没有管理员、并且设置了 `MOTE_ADMIN_PASSWORD` 时创建。没有管理 CLI、注册、邮件找回或 OAuth。密码不进仓库。
- 命令活动只保留最近 10,000 条。`duration_ms` 是命令从创建到完成的墙钟时间，不是心跳 RTT。

## Token 处理

- 密钥是长的、密码学随机值（`crypto.randomBytes`）。
- Relay 只持久化 SHA-256 十六进制摘要。
- 校验时对出示的密钥做哈希，再用 `timingSafeEqual` 比较摘要。
- 明文密钥只在 Dashboard 创建或轮换时显示一次，且永不写入源文件。
- 日志使用 `device_id`、`command_id`、`token_id` 和 `pair_request_id`。不得包含 Bearer token、设备凭据、`pair_secret`、管理员 cookie 或 Authorization 头。请求 URL 如果仍带有 `pair_secret`、`token`、`credential` 或 `password` 查询参数，写入日志前会被替换成 `[redacted]`。
- 配对 WebSocket 不从查询参数认证。Mac 连上 `wss://…/v1/ws/pair` 之后发送 `pair_auth`，正文里才有 `request_id` 和 `pair_secret`。Relay 只保存 `pair_secret` 的 SHA-256 哈希。设备明文凭据在批准时生成，只推给已经认证的配对 WebSocket，不入库。
- `command_result` 必须来自该命令的目标设备。其他已认证设备不能用同一个 `command_id` 改变结果。不匹配会记一条安全日志，日志里只有设备 ID 和命令 ID。
- 公开 `POST /v1/pair/requests` 按 IP（默认 10 分钟 20 次）与 `device_id`（默认 10 分钟 5 次）限流。错误的 `pair_secret` 不能领取凭据。
- `GET /s/:deviceId` 是公开安装页：只带 Device ID 和命令 URL，不带 token，也不展示设备是否在线。

## 传输

- 生产环境仅使用 HTTPS 和 WSS。
- 文档示例公网主机名是 `relay.example.com`；生产换成自己的主机名，并用 `MOTE_PUBLIC_URL` 对齐。
- 客户端始终使用该 HTTPS 基址以及由其推导的 `wss://…/v1/ws/device` 和 `wss://…/v1/ws/pair`。
- Dashboard SSE（`GET /admin/api/events`）与页面同源，走 `connect-src 'self'`；事件里只有 topic，没有凭据或实体。
- 本地 Wrangler 使用 `http://127.0.0.1:8787`。不要让 iPhone 快捷指令去访问这台开发机的回环地址。
- Mac 生产代码永不关闭 TLS 校验。

## 命令完整性

- Relay 生成命令的 `id`、`created_at`、`expires_at` 和 `nonce`。`nonce` 是不透明非空字段，不是签名，也不是重放保护。快捷指令不提供这些字段。
- 默认 TTL 为 10 秒。
- 离线命令立即拒绝，永不排队。
- 重复命令 ID 由 Mac 的近期 ID 缓存拒绝。Relay 的 pending 条目只 resolve 一次。
- 不是 `lock` 的动作会被拒绝。
- WebSocket 设备必须先认证才能接收命令。
- 未认证套接字在认证超时（默认 5 秒）之后，由 Durable Object alarm 在下一次清扫时关闭。清扫间隔默认 15 秒，所以关闭不会早于超时，但可能略晚。超时关闭不发送 `invalid_credentials`，以便 Mac 重连。
- 在途命令等待只在 Durable Object 内存中。对象被驱逐时这次等待会丢失，调用方等到自己的 HTTP 超时。命令不会写入队列。

## 执行边界

Mote Agent 只能运行预定义的本地动作（当前为 `lock`）。

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
- Dashboard 使用 HttpOnly 管理员会话 cookie；`/admin/api/*` 响应为 `Cache-Control: no-store`。SSE 另加 `X-Accel-Buffering: no`，减少反向代理缓冲。
- 登录有独立的内存速率限制
- HTML 响应带有 CSP、`X-Content-Type-Options`、`Referrer-Policy` 和 `frame-ancestors 'none'`

## 部署说明

- 生产运行时是 Cloudflare Worker 和同一个 `MoteRelay` Durable Object。在家和外出都走这个 HTTPS 主机名。当前不使用 Split DNS。
- Cloudflare Tunnel 不是 Mote 的生产架构。Relay 不保存 Tunnel token，也不调用 Cloudflare API。
- 不要在 Mote 前面放交互式 Cloudflare Access。快捷指令 / 未来 iOS 的 Bearer `send_command` token、Mac 的 `device_connection` 凭据，以及 Dashboard 管理员会话已经负责认证。交互式登录会干扰快捷指令、未来的 iOS 客户端和持久 WebSocket。
- Bearer、设备 WebSocket 认证、凭据角色分离、命令允许列表、速率限制、TTL、无命令队列和重复保护全部保留。`/health` 可以保持未认证。
- 管理员密码用 Wrangler secret 或 Workers 环境变量。不要把 Cloudflare API token 写进仓库。
- 没有管理 CLI。管理员操作走 Dashboard。
