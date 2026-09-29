# 协议

本文定义 **Mote Protocol v1**。

Mac 客户端和 Mote Relay 都实现这一线上格式。不要另起一套命令模式。

## 版本

```text
Mote Protocol v1
```

每个成帧对象都包含 `"version": 1`。未知或其他版本一律拒绝。

## 时间戳格式

所有时间戳均为 **Unix 纪元毫秒**（`Int64`）。

不要混用秒和毫秒。

例如：`created_at`、`expires_at`、`completed_at`、`sent_at`、`server_at`。

## 动作

当前只实现：

```text
lock
```

规范在 [protocol/](../protocol/README.md)。`sleep`、`mute`、`unmute`、`play_pause` 不属于 Protocol v1。收到它们时按未知动作拒绝。

### 允许列表规则

- 动作必须是 Protocol v1 里实际会执行的动作。当前只有 `lock`。
- 禁止任意 shell 命令。
- 禁止任意可执行路径。
- 禁止远程客户端下发任意 AppleScript。
- 服务器不得充当通用远程代码执行系统。
- 未知动作必须拒绝。

Mote Agent 为每个允许列表中的动作执行固定的本地实现。客户端只发送动作名，从不发送代码。

## 设备身份

- `device_id` 是 Mote for Mac 生成一次后持久保存的 UUID。
- 它保存在本地，不能每次启动都变。
- 它不是硬件序列号或 MAC 地址。
- 目标 `device_id` 与当前这台 Mac 不匹配的命令会被拒绝。
- Mote Relay 在 Dashboard 批准配对时登记同一个 ID。生产路径是 Mac 点 Pair，批准后写入这一 ID。

## 配对

未配置的 Mac 先走配对通道，再使用设备 WebSocket。

```text
POST https://relay.example.com/v1/pair/requests
{ "device_id": "<uuid>", "device_name": "MacBook Pro" }
```

成功响应。`pair_secret` 只出现在这份 JSON 正文里，而且只出现一次：

```json
{
  "request_id": "<uuid>",
  "pair_secret": "<one-time-secret>",
  "expires_at": 1770000000000
}
```

然后 Mac 连接一条不含密钥的配对 WebSocket：

```text
wss://relay.example.com/v1/ws/pair
```

连接建立后，第一条客户端帧必须是 `pair_auth`：

```json
{
  "type": "pair_auth",
  "version": 1,
  "request_id": "<uuid>",
  "pair_secret": "<one-time-secret>"
}
```

Relay 对照已保存的 SHA-256 校验 `pair_secret`。只有校验成功之后，套接字才会收到 `pair_pending`，之后才可能收到批准的设备凭据。查询参数不参与认证。URL 里如果出现 `pair_secret`，会被忽略，也不得写入日志。

未认证的配对套接字使用和设备套接字相同的认证超时（默认 5 秒，`MOTE_AUTH_TIMEOUT_MS`）。超时关闭码是 `1008`，原因是 `auth_timeout`。无效的 `pair_auth` 关闭码是 `1008`，原因是 `invalid_credentials`。

Relay 下行（只在认证成功之后）：

| type            | 含义                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `pair_pending`  | 请求已挂起，正在等待管理员                                                       |
| `pair_approved` | 含 `device_id`、`credential`、`name`。Mac 把凭据写入钥匙串并改连 `/v1/ws/device` |
| `pair_rejected` | 管理员拒绝或 Mac 取消                                                            |
| `pair_expired`  | 超时或被新的 Pair 覆盖                                                           |

管理员：

```text
GET  /admin/api/pair-requests
POST /admin/api/pair-requests/:id/approve   { "name": "optional" }
POST /admin/api/pair-requests/:id/reject
GET  /admin/api/events
```

Mac 取消：

```text
POST /v1/pair/requests/:id/cancel
{ "pair_secret": "<secret>" }
```

同一 `device_id` 同时只保留一条 pending。新的 Pair 会取消旧的 pending，并向旧套接字发送 `pair_expired`。明文凭据不入库；批准时生成并推给配对套接字，也可在 Dashboard 显示一次。

公开 `POST /v1/pair/requests` 默认限流：

- 每个 `device_id`：10 分钟内 5 次（`MOTE_PAIR_RATE_LIMIT_*`）
- 每个 IP：10 分钟内 20 次（`MOTE_PAIR_IP_RATE_LIMIT_*`）

默认 10 分钟过期（`MOTE_PAIR_TTL_MS`）。错误的 `pair_secret` 不能领取凭据。取消请求把 `pair_secret` 放在 POST 正文里，不放在 URL 里。

凭据轮换在 Dashboard 完成。折叠的「Paste credential instead」用来粘贴轮换后的新凭据。没有改线上数据库的 CLI。

## 设备 WebSocket

生产 URL：

```text
wss://relay.example.com/v1/ws/device
```

生产路径：

```text
Mac
  ↓
wss://relay.example.com/v1/ws/device
  ↓
Cloudflare Worker
  ↓
MoteRelay Durable Object
```

不要另开 WebSocket 端口或单独的 WebSocket 主机名。由 HTTPS 基址推导（文档示例为 `https://relay.example.com`，生产用 `MOTE_PUBLIC_URL` / Mac 的 Relay URL）。开发可用 `MOTE_RELAY_URL`（以及 DEBUG 设置字段）覆盖基址。`http://` 覆盖使用 `ws://`；`https://` 覆盖使用 `wss://`。配对套接字由同一基址推导为 `/v1/ws/pair`。

Mac 始终发起**出站**连接。从不需要路由器入站端口转发。

生产环境永不关闭 TLS 校验。

### 时序

```text
CONNECT
  ↓
auth
  ↓
auth_result
  ↓
heartbeat ↔ heartbeat_ack
  ↓
command
  ↓
command_result
```

应用层「已连接」的含义是 `auth_result.status == "ok"`。仅 TCP/WebSocket 握手成功不够。Relay 不会再发单独的 `connected` 帧。

只有已认证的套接字才会处理命令。

## 认证

WebSocket 建立后，Mac 立即发送：

```json
{
  "type": "auth",
  "version": 1,
  "device_id": "device_uuid",
  "credential": "device_secret",
  "app_version": "1.0.0 (1)",
  "platform": "macos",
  "actions": ["lock"]
}
```

`platform` 取 `macos` 或 `windows`。`actions` 是这台 Agent 声明自己能执行的动作名，必须来自协议已知名单。Relay 只转发同时满足这两条的命令：动作已经实现，并且出现在当前这条连接的 `actions` 里。省略 `actions` 时按 `["lock"]` 处理，已经安装的客户端不用改也能继续锁屏。省略 `platform` 时不覆盖这台设备上次报过的平台。未知的 `platform` 或非法的 `actions` 会使这帧认证无效。

`app_version` 是可选的应用版本字符串（例如 `CFBundleShortVersionString (CFBundleVersion)`），与协议字段 `version` 无关。缺省、空串、非字符串或超过 64 个字符时，Relay 仍接受认证，且不覆盖该设备已保存的版本。

Relay 成功响应：

```json
{
  "type": "auth_result",
  "version": 1,
  "status": "ok"
}
```

失败：

```json
{
  "type": "auth_result",
  "version": 1,
  "status": "error",
  "error": "invalid_credentials"
}
```

该凭据是 Mac 的 `device_connection` 密钥。它与快捷指令的 `send_command` 凭据不可互换。Mac 只把它存在钥匙串。

若认证失败或超时（Mac 侧约 10 秒），Mac 不会把会话标为已连接。凭据无效会停止自动重连，直到用户再次连接或更新凭据。

Relay 会在约 5 秒（`MOTE_AUTH_TIMEOUT_MS`）后关闭未认证套接字。超时关闭**不会**发送 `auth_result.error = invalid_credentials`，因此 Mac 可以重连。真正的凭据失败会发送该错误然后再关闭。

## 心跳

间隔：认证成功后每 **30 秒**。

Mac → Relay：

```json
{
  "type": "heartbeat",
  "version": 1,
  "device_id": "device_unique_id",
  "sent_at": 0
}
```

Relay → Mac：

```json
{
  "type": "heartbeat_ack",
  "version": 1,
  "sent_at": 0,
  "server_at": 0
}
```

`sent_at` 是回显的客户端心跳时间戳。`server_at` 是 Relay 接收/发送时间。Mac 用 `now - sent_at` 估算近似 RTT。这不是精密基准测试。

## 命令对象

Relay → Mac（WebSocket 帧）：

```json
{
  "type": "command",
  "version": 1,
  "id": "cmd_unique_id",
  "device_id": "device_unique_id",
  "action": "lock",
  "created_at": 0,
  "expires_at": 0,
  "nonce": "random-value"
}
```

| 字段         | 用途                                       |
| ------------ | ------------------------------------------ |
| `type`       | 设备 WebSocket 上始终为 `command`。        |
| `version`    | 协议版本。V1 为 `1`。                      |
| `id`         | 唯一命令标识。重复 ID 不得执行两次。       |
| `device_id`  | 目标 Mac 设备。                            |
| `action`     | 允许列表中的动作名。                       |
| `created_at` | 命令创建时的 Unix 纪元毫秒。               |
| `expires_at` | 超过该时刻后必须忽略命令的 Unix 纪元毫秒。 |
| `nonce`      | Relay 生成的不透明非空字符串。不签名，也不做重放记录。 |

### TTL

默认命令寿命为 **10 秒**（`expires_at = created_at + 10000`）。

若 `now > expires_at`，Mac 不执行该命令，并返回 `status = expired`。

这可以避免稍后重连时执行过期的锁屏。

### 校验

执行前，Mac 会校验：

- 协议版本为 `1`
- 命令 ID 存在
- 目标 `device_id` 与本机安装匹配
- 动作在已实现的允许列表中
- `created_at` / `expires_at` 为正且顺序正确
- `created_at` 没有不合理地落在未来（约 2 分钟）
- `nonce` 非空。它不是签名，也不是重放数据库的键
- 命令 ID 不在近期 ID 缓存中

无效命令不会执行。Mac 在内存中保存有界的近期命令 ID 缓存（数百条，而不是无限）。重复执行由命令 `id` 挡住。`nonce` 留在 v1 里，是因为已经安装的 Mac 要求这个字段；去掉它要等不兼容的版本决定。

## 命令结果

Mac → Relay：

```json
{
  "type": "command_result",
  "version": 1,
  "command_id": "cmd_unique_id",
  "status": "completed",
  "completed_at": 0
}
```

`failed` 时可附带可选的 `error` 字符串。

Relay 只接受目标设备提交的结果。`PendingCommands` 同时记下 `command_id` 和目标 `device_id`。另一台已认证设备即使拿得到 `command_id`，也不能完成、失败或以其他方式改掉这条命令。这种不匹配会被拒绝，pending 保持原样，并记一条不含密钥的安全日志。未知 `command_id` 和重复结果仍然是无操作。

| 字段           | 用途                                 |
| -------------- | ------------------------------------ |
| `type`         | 始终为 `command_result`。            |
| `version`      | 协议版本。V1 为 `1`。                |
| `command_id`   | 该结果对应的命令 `id`。              |
| `status`       | 命令结果。                           |
| `completed_at` | Agent 处理完命令时的 Unix 纪元毫秒。 |

Mote for Mac 发送的 `status` 取值：

- `completed`
- `failed`
- `expired`
- `invalid`
- `unsupported`
- `permission_required`

Relay 接受以上全部。Mac 不会发送泛化的 `rejected`；应使用更具体的状态。

## Relay 错误帧

Relay 可以发送：

```json
{
  "type": "error",
  "version": 1,
  "error": "description"
}
```

畸形 JSON 不得导致 Agent 崩溃。未知的 `type` 值会被忽略。

## 传输映射

命令对象只在设备 WebSocket 上出现。快捷指令和 Dashboard 经 HTTPS 把动作名交给 Relay，Relay 再生成这个对象。

活动来源 `source` 只有 `shortcut` 和 `dashboard`。公开命令 API 记为 `shortcut`。Dashboard 发令记为 `dashboard`。请求体不能自己声明来源。`client_kind` 只能是 `shortcut`。

## 命令 HTTP API

这是机器 HTTP API，不是设备帧协议。iPhone 上的快捷指令步骤见 [shortcuts.md](shortcuts.md)。

生产基址示例：`https://relay.example.com`（部署时换成自己的 `MOTE_PUBLIC_URL`）

快捷指令只需要 URL、`Authorization: Bearer`、JSON 正文，以及扁平的 `status` 字段。`id`、`created_at`、`expires_at` 和 `nonce` 由 Relay 生成。快捷指令不得发送这些字段。

### 提交命令

```http
POST /v1/devices/:deviceId/commands
Authorization: Bearer <shortcut-token>
Content-Type: application/json

{"action":"lock"}
```

Mac 成功确认：

```json
{
  "status": "completed",
  "device_id": "device_uuid",
  "device": "MacBook Pro",
  "command_id": "cmd_..."
}
```

其他 Mac `command_result` 取值同样返回 HTTP `200`，并使用相同的扁平结构（`permission_required`、`failed`、`expired`、`invalid`、`unsupported`）。

离线（不排队）：

```http
409 Conflict
```

```json
{
  "status": "offline",
  "device_id": "device_uuid",
  "device": "MacBook Pro",
  "error": {
    "code": "DEVICE_OFFLINE",
    "message": "Device is currently offline."
  }
}
```

等待 `command_result` 超时：

```http
504 Gateway Timeout
```

```json
{
  "status": "timeout",
  "device_id": "device_uuid",
  "device": "MacBook Pro",
  "command_id": "cmd_..."
}
```

### 设备状态

```http
GET /v1/devices/:deviceId/status
Authorization: Bearer <shortcut-token>
```

```json
{
  "device_id": "device_uuid",
  "name": "MacBook Pro",
  "online": true,
  "last_seen_at": 0
}
```

绝不包含密钥。

### HTTP 状态码

| 状态码 | 含义                                                                    |
| ------ | ----------------------------------------------------------------------- |
| 200    | 已从 Mac 收到命令结果                                                   |
| 400    | JSON 无效或字段缺失                                                     |
| 401    | 缺少或无效的 Bearer token                                               |
| 403    | Token 不是 `send_command`                                               |
| 404    | 未知设备                                                                |
| 409    | 设备离线（`status: offline`）或已禁用（`status: disabled`）；命令不排队 |
| 413    | JSON 正文超过 `MOTE_MAX_BODY_BYTES`（默认 16 KiB）                      |
| 422    | 动作不是 Protocol v1 的 `lock`，或当前连接没有报告 `lock`               |
| 429    | 命令速率限制（默认每 token 每 10 秒 10 次，`status: rate_limited`）     |
| 503    | `/ready` 未就绪，或进行中的命令过多                                     |
| 504    | 在 Relay 截止时间前未收到 `command_result`（默认 12 秒）                |
| 500    | 未预期的服务器失败                                                      |

校验错误使用：

```json
{
  "error": {
    "code": "DEVICE_OFFLINE",
    "message": "Device is currently offline."
  }
}
```

面向快捷指令的命令响应在有意义时也会保留顶层 `status`。

无需认证的存活检查：

```text
GET /health   → { "status": "ok" }
GET /ready    → { "status": "ok" } 或 503 { "status": "not_ready" }
```

`GET /` 返回 Dashboard HTML，不是 JSON。`/v1/*` 与 `/admin/api/*` 的未知路径仍返回 JSON 404。

`/ready` 检查进程已初始化且 SQLite 可查询。Mac 离线不影响 Relay 健康。

## 管理员事件流

Dashboard 用管理员 cookie 开一条 SSE：**只推 topic**，不推设备或活动实体。页面再请求现有 `/admin/api/*` 拉快照。设备 WebSocket 协议不变。

```text
GET /admin/api/events
```

认证：`mote_admin_session`。GET 不做 CSRF Origin 检查。无会话返回 401。

响应头：

```text
Content-Type: text/event-stream
Cache-Control: no-store
Connection: keep-alive
X-Accel-Buffering: no
```

连上先发 hello（四个 topic），方便新标签页对齐：

```text
data: {"topics":["devices","pairing","activity","tokens"]}
```

之后同一 topic 约 75ms 内合并成一条。心跳 `touch` **不推**。每 15 秒写一行 SSE comment 保活。断开即取消订阅。

| topic      | 何时推送                                           |
| ---------- | -------------------------------------------------- |
| `devices`  | 上线、掉线、心跳过期踢线、改名、启停、轮换凭据     |
| `pairing`  | 创建、批准、拒绝、取消、过期或被新 Pair 顶替       |
| `activity` | 命令已接受、已发送、终态（成功 / 失败 / 超时等）   |
| `tokens`   | 创建、轮换、启停                                   |

Dashboard 在 SSE 正常时把兜底轮询收到 30 秒；断线回到原来的 5–8 秒（有待批准配对时 2 秒）。

## 重连（Mac）

若套接字断开且用户没有主动 Disconnect，Mac 会按指数退避重连：

```text
1s, 2s, 4s, 8s, 15s, 30s
```

上限 30 秒，带少量抖动。稳定的已认证连接约 10 秒后重置退避。网络路径恢复可能触发新的尝试。每个 Agent 实例只有一条设备 WebSocket。

## 明确的非目标

协议永远不会包含：

- 自由格式的 `shell` 或 `exec` 字段
- 客户端提供的脚本正文
- 客户端提供的二进制路径
- 泛化的「运行这段载荷」动作
- 客户端自选的键盘序列、URL 或文件系统路径
