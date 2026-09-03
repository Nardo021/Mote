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

V1 只实现：

```text
lock
```

预留的未来取值（V1 未实现；在明确实现前视为不支持）：

```text
sleep
mute
unmute
play_pause
```

### 允许列表规则

- 动作必须来自预定义允许列表。
- 禁止任意 shell 命令。
- 禁止任意可执行路径。
- 禁止远程客户端下发任意 AppleScript。
- 服务器不得充当通用远程代码执行系统。
- 未知动作必须拒绝。
- 已预留但尚未实现的动作，在明确实现前必须当作未知/不支持。

Mote Agent 为每个允许列表中的动作执行固定的本地实现。客户端只发送动作名，从不发送代码。

## 设备身份

- `device_id` 是 Mote for Mac 生成一次后持久保存的 UUID。
- 它保存在本地，不能每次启动都变。
- 它不是硬件序列号或 MAC 地址。
- 目标 `device_id` 与当前这台 Mac 不匹配的命令会被拒绝。
- Mote Relay 通过 `device create --id` 登记同一个 ID。若省略 `--id`，Relay 可以自己生成 UUID；Phase 2 没有生产界面覆盖 Mac 的 ID，因此 V1 配对是把 Mac 上的值复制到 Relay。

## 设备 WebSocket

生产 URL：

```text
wss://relay.yanze.me/v1/ws/device
```

生产路径：

```text
Mac
  ↓
wss://relay.yanze.me/v1/ws/device
  ↓
Cloudflare
  ↓
Tunnel
  ↓
192.168.2.44:3000
  ↓
Mote Relay
```

不要另开 WebSocket 端口或单独的 WebSocket 主机名。由 HTTPS 基址 `https://relay.yanze.me` 推导。开发可用 `MOTE_RELAY_URL`（以及 DEBUG 设置字段）覆盖基址。`http://` 覆盖使用 `ws://`；`https://` 覆盖使用 `wss://`。

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
  "credential": "device_secret"
}
```

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
| `nonce`      | 用于防重放的不可预测值。必填且非空。       |

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
- `nonce` 存在
- 命令 ID 不在近期 ID 缓存中

无效命令不会执行。Mac 在内存中保存有界的近期命令 ID 缓存（数百条，而不是无限）。V1 不要求 Mac 上有持久重放数据库。

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

同一套命令和结果对象应可用于：

- V1：Apple 快捷指令经 HTTPS 进入 Mote Relay，再经 WebSocket 到 Mote Agent
- V2：Mote iOS 经本地传输到 Mote Agent，并以 Relay 作为回退

不要为本地传输另起一套命令模式。下面的快捷指令 HTTP API 始终会在设备套接字上产出该命令对象。

## 快捷指令 HTTP API

生产基址：`https://relay.yanze.me`

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
| 422    | 动作已预留或未知                                                        |
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
