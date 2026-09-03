# Mote for Mac

Mote 的原生 macOS 应用和后台 Agent。

当前版本 **1.3.0**（build **4**）。Mac 客户端可以运行、显示状态、通过 **Pair** 写入钥匙串、锁定本机会话，并通过真实的出站 WebSocket 使用 Mote Protocol v1。

## 技术栈

- Swift 6、SwiftUI、菜单栏（`NSStatusItem`）
- `URLSessionWebSocketTask` 以及 `NWPathMonitor`
- Security / 钥匙串服务
- ServiceManagement（`SMAppService`）
- OSLog
- CoreGraphics 锁屏快捷键（`Control + Command + Q`）
- ApplicationServices 辅助功能信任（`AXIsProcessTrusted`）

部署目标：**macOS 14+**

Bundle identifier：

```text
me.yanze.mote
```

不通过 App Store 分发。Xcode 工程使用兼容自动签名的设置，Team ID 为空。不要提交 Team ID 或描述文件 UUID。日常自己用：在本机选付费 Development Team，用 Xcode **Run** 覆盖安装即可。

## 打开与构建

```text
open macos/Mote.xcodeproj
```

或从仓库根目录：

```text
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -configuration Debug -destination 'platform=macOS' build
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -configuration Debug -destination 'platform=macOS' test
```

若需要完整签名的登录项，请在本机选择 Development Team。日常 Debug 构建使用 Ad-hoc（`Sign to Run Locally`）即可。

## 布局

```text
macos/
├── Mote.xcodeproj
├── Mote/
│   ├── App/           生命周期、AppState、主窗口、配对空状态
│   ├── Agent/         连接协调与心跳
│   ├── Actions/       允许列表中的本地动作（lock）
│   ├── Commands/      与传输无关的命令处理
│   ├── Design/        颜色、间距、字体与状态文案 token
│   ├── Networking/    Relay 配置、WebSocket、配对、重连
│   ├── Security/      钥匙串、校验、辅助功能
│   ├── Storage/       非密钥偏好与设备 ID
│   ├── MenuBar/       状态项与自定义图标
│   ├── Models/        协议与连接模型
│   ├── Utilities/     日志、日期、登录项、版本
│   └── Resources/     Info.plist、entitlements、资源
└── MoteTests/         协议、校验、配对和执行器测试
```

`Commands/CommandProcessor` 是后续本地传输的接缝。Bonjour / 直连尚未实现。

## 运行时行为

1. 启动时加载持久的 `device_id` 和设置。
2. 缺少设备凭据 → 主窗口显示 **Mote is not configured** 和 **Pair**。不会假装已连接或显示虚假延迟。
3. 点 Pair 后状态为 **Waiting for Approval…**。Dashboard 批准 → 凭据写入钥匙串并立刻连接，无需重启。
4. 凭据存在且已启用 Connect → 出站 `wss://relay.yanze.me/v1/ws/device`。
5. 仅在 `auth_result.status == "ok"` 之后才进入应用层 **Connected**。
6. 每 30 秒心跳一次；延迟是来自 `heartbeat_ack` 的近似 RTT。已连接标题旁显示 `Relay · 4 ms`。
7. **Remote Actions → Lock** 显示 `Available` 或 `Unavailable`（取决于辅助功能）。
8. 断开后按带抖动的指数退避（1–30 秒）重连，除非用户选择了 **Disconnect**。
9. 关闭设置窗口不会退出。**Quit Mote** 会停止重连、关闭套接字、取消心跳并退出。

连接状态文案：

```text
Not Configured
Waiting for Approval…
Connecting…
Authenticating…
Connected
Reconnecting…
Disconnected
Connection Error
```

## 凭据

角色：`device_connection`（不是快捷指令的 `send_command` token）。

- 只存放在钥匙串，service 为 `me.yanze.mote`，account 为 `device_connection`
- 永不写入 UserDefaults、日志或源码
- 生产主路径是 **Pair**；折叠的 **Paste credential instead** 仅用于轮换或 CLI 恢复
- 快捷指令 token 不会被 Mote 保存。**Shortcuts** 区只预填 Device ID，token 输入框是助手，不持久化

### 与 Mote Relay 配对

1. 打开 Mote，点 **Pair**。
2. Dashboard **Devices** 出现待批准请求，点 **Allow**。
3. Mac 实时写入钥匙串并连接。无需重启。

CLI 仍可用于恢复：

```text
docker compose exec relay node dist/cli.js device create --name "MacBook Pro" --id <MAC_DEVICE_ID>
```

然后在 Mac 折叠区粘贴设备凭据。

### 临时 DEBUG 配对

开发时：

- DEBUG 设置 → **Developer** 区可以把设备凭据保存到钥匙串
- 可选环境变量：`MOTE_DEVICE_CREDENTIAL`（钥匙串为空时的 DEBUG 回退；除非你保存，否则不持久化）
- 可选 Relay 覆盖：`MOTE_RELAY_URL` 或 DEBUG URL 字段（本地 Relay 用 `http://127.0.0.1:3000`）

这些 DEBUG 控件会在 Release 中编译剔除。不要在生产中关闭 TLS 校验。

## 锁屏动作与辅助功能

远程 `lock` 映射到受信任的本地实现：合成官方 **Control + Command + Q** 锁屏快捷键。

这需要辅助功能 / 事件发送信任。应用会：

- 用 `AXIsProcessTrusted` 检测信任
- 显示 **Lock Permission — Granted / Required**
- 按请求打开系统设置
- 若缺少信任，以 `permission_required` 干净失败
- 不会在每次启动时刷系统提示

认证并校验通过后，远程锁屏会立即执行。DEBUG **Test Lock** 只走 `ActionExecutor`，并标明会立即锁定这台 Mac。

## 开发用模拟命令

DEBUG **Developer** 可以把本地命令注入 `CommandProcessor`（校验 → 执行 → 结果），而不假装收到了 Relay 帧。

- 过期 / 错误设备 / 未知动作的模拟永远不会锁屏
- **Send Valid Mock Lock Command** 和 **Test Lock** 会锁定这台 Mac
- 自动化测试使用记录型执行器，从不调用真实锁屏动作

`MockRelayTransport` 用于协议级夹具。生产始终使用 `WebSocketTransport`。

## 手动验证清单

1. **启动 Mote** — 菜单栏图标出现；若未配置，会打开设置窗口。
2. **检查生成的 Device ID** — 显示一个 UUID，重启后仍在。
3. **Pair** — Dashboard Allow 后进入 Connected，无需粘贴凭据。
4. **检查钥匙串凭据行为** — DEBUG：保存/清除凭据；确认它不在 UserDefaults 或日志中。
5. **检查辅助功能权限** — 状态为 Required 或 Granted；打开系统设置可用。
6. **使用 DEBUG Test Lock** — 标明会立即锁定这台 Mac。
7. **确认 Mac 锁屏** — 出现锁屏界面。
8. **重新打开会话** — 解锁后 Mote 仍在运行。
9. **检查 Start at Login 开关** — 反映 `SMAppService` 状态；可启用和关闭。
10. **检查菜单栏** — 状态、设备名、Relay 摘要、权限、Connect/Disconnect、Quit。
11. **设置开发用 Relay 凭据** — DEBUG 钥匙串保存或 `MOTE_DEVICE_CREDENTIAL`。
12. **尝试 Relay 连接** — Connect；Relay 运行且凭据匹配时，应看到 Authenticating 然后 Connected。没有 Relay 时，看到 Connecting / Authenticating / Connection Error / Reconnecting…，绝不能是假的 Connected。
13. **使用模拟命令** — 过期和错误设备的模拟被拒绝；有效的模拟锁屏在本地执行。
14. **确认命令校验** — 最近结果按情况显示 `expired` / `invalid` / `unsupported`。
15. **退出 Mote** — 进程退出；重连停止。

## 界面

视觉规范以仓库根目录的 [`design.md`](../design.md) 为准。Mote for Mac 是紧凑的原生菜单栏工具，而不是仪表盘或营销页。

### 主窗口

默认约 `520 × 560`，最小约 `460 × 480`。内容最大宽度 520 px。内容按纵向分组：

- 设备名 + 连接状态；已连接时显示 `Relay · 4 ms`
- **Connection** — Relay 主机与延迟；未配置时不显示
- **Remote Actions** — `Lock`：`Available` 或 `Unavailable`
- **Permissions** — Lock Permission：`Granted` 或 `Required`，缺权限时可打开系统设置
- **Startup** — Start Mote at Login，绑定真实的 `SMAppService` 状态
- **Device** — 可编辑设备名、缩写 Device ID、复制完整 ID、Version
- **Shortcuts** — Device ID 已填；token 输入框为空，不持久化；**Add to Shortcuts** 打开 `/s/:deviceId`

未配置时显示 Pair 空状态（可展开粘贴凭据），而不是 `Disconnected` / `0 ms` / Relay 主机。配对中标题为 **Waiting for approval**。

### 菜单栏

菜单栏是日常主界面。图标是自定义中继标记，右下角用颜色圆点表示状态（不是 SF Symbol template）。菜单只保留状态、设备名、Relay 摘要、权限、登录项，以及 Open Mote / Disconnect / Quit Mote。未配置时显示 **Mote is not configured**。诊断信息在主窗口。

### Debug / Advanced

DEBUG 构建设置底部有折叠的 **Advanced**：Relay Endpoint、协议版本、连接状态、命令 ID、开发凭据、模拟命令和 Test Lock。Release 会编译剔除。正常界面不显示凭据、Bearer token 或钥匙串内容。

## 协议

见 [docs/protocol.md](../docs/protocol.md)。

```text
wss://relay.yanze.me/v1/ws/device
CONNECT → auth → auth_result → heartbeat ↔ heartbeat_ack → command → command_result
```

配对：

```text
POST /v1/pair/requests
wss://relay.yanze.me/v1/ws/pair?request_id=…&pair_secret=…
```

时间戳为 Unix 纪元毫秒。默认命令 TTL 为 10 秒。Mac 侧认证超时约 10 秒。

## 本阶段不包含

- 在 iPhone 上静默安装已填 token 的快捷指令（见 [docs/shortcuts.md](../docs/shortcuts.md)）
- 原生 iOS 应用（计划见 [docs/ios.md](../docs/ios.md)）
- Bonjour / 本地 TCP / BLE
- 任意 shell、AppleScript 或可执行路径执行
