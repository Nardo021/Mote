# Mote Protocol v1

`protocol/` 是 Protocol v1 的规范。版本号保持 `1`。这里没有 Protocol v2。

权威文件：

```text
protocol/catalogue.json       版本、动作、活动来源、WebSocket 路径、关闭原因、HTTP 错误码
protocol/mote-v1.schema.json  设备帧与配对帧
protocol/fixtures/            合法帧，以及会失败的样例
```

Relay 的 TypeScript 和 Mac 的 Swift 各自有本地类型。它们必须和这些文件一致。Relay 测试直接读取这里的 JSON。Swift 测试用源文件路径读取同一批 JSON：Xcode 只同步 `macos/MoteTests`，不会把 `protocol/` 打进测试包。

不要在别的目录再维护一份动作列表、协议版本或关闭原因。运行时超时、心跳间隔和部署地址不属于这份契约。

## 四条边界

1. **设备 WebSocket** — `/v1/ws/device`。帧：`auth`、`auth_result`、`heartbeat`、`heartbeat_ack`、`command`、`command_result`、`error`。
2. **配对 WebSocket** — `/v1/ws/pair`。第一帧必须是 `pair_auth`。之后 Relay 发送 `pair_pending`、`pair_approved`、`pair_rejected`、`pair_expired`。
3. **机器 HTTP API** — 快捷指令使用的 `POST /v1/devices/:deviceId/commands` 等。它提交动作名，不重复定义 WebSocket 帧。
4. **管理员 HTTP API** — Dashboard 的 `/admin/api/*`。这不是设备线协议。

## 兼容

- 只接受上面列出的帧和动作。当前动作只有 `lock`。
- 未知 `type` 在设备通道上解析为 `unknown_type`，连接保持，帧被忽略。
- `version` 不是 `1` 时拒绝。
- 已知帧上多出来的字段，解析器会忽略。样例本身不能带未写入 schema 的字段。
- 不兼容的线格式变更必须单独决定版本，不能靠搬文件把版本号加一。

## 常量归谁

| 常量 | 归类 |
| --- | --- |
| `version`、设备/配对 WebSocket 路径、动作、帧、关闭原因 | 协议。见 `catalogue.json` |
| 命令 TTL、命令超时、心跳过期、认证超时、配对限制 | Relay 运行时配置 |
| Mac 心跳发送间隔、Mac 等待 `auth_result` 的时间 | Mac 客户端策略 |
| `MOTE_PUBLIC_URL`、管理员口令 | 部署配置 |

`nonce` 是 Relay 生成的不透明非空字符串。它不签名，也不进入重放存储。防重复执行靠命令 `id`。已安装的 Mac 要求这个字段存在，所以 v1 保留它。拿掉它是以后的不兼容变更。

## 活动来源

当前只会写入 `shortcut` 和 `dashboard`。`ios` 只曾是没有原生客户端的占位。迁移 7 把历史 `source = ios` 和 `client_kind = ios` 改成 `shortcut`，不删除活动行。公开命令 API 不再接受 `client_kind = ios`。

## 错误

机器可读的 HTTP 错误码和 WebSocket 关闭原因在 `catalogue.json`。关闭码和原因字符串是两套字段。HTTP 错误码不和 WebSocket 关闭原因合成一个枚举。

设备认证失败统一为 `invalid_credentials`。禁用的设备和错误的密钥使用同一个原因，避免靠错误文本枚举账号。
