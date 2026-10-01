# Mote for Mac

Mote 的原生 macOS 应用和后台 Agent。

当前版本 **2.0.0**（build **15**）。Mac 客户端可以运行、显示状态、通过 **Pair** 写入钥匙串、锁定本机会话，并通过真实的出站 WebSocket 使用 Mote Protocol v1。

## 技术栈

- Swift 6、SwiftUI、菜单栏（`NSStatusItem`）
- `URLSessionWebSocketTask` 以及 `NWPathMonitor`
- Security / 钥匙串服务
- ServiceManagement（`SMAppService`）
- OSLog
- `login.framework` 会话锁屏（`SACLockScreenImmediate`）
- CoreGraphics 锁屏快捷键回退（`Control + Command + Q`）
- ApplicationServices 辅助功能信任（`AXIsProcessTrusted`，仅回退路径）

部署目标：**macOS 14+**

稳定应用身份（Bundle ID、钥匙串 service、OSLog subsystem 相同）：

```text
com.nardo021.mote
```

仓库所有者是 GitHub `Nardo021`，树里没有另一套产品域名，所以不再使用占位符 `com.example.mote`。测试包是 `com.nardo021.mote.tests`。旧的 `com.example.mote` 只在一次性迁移里读取。

Mac 没有编译进去的生产 Relay 主机名。设置里的 Relay URL 或 `MOTE_RELAY_URL` 必须是明确的 `http`/`https` 基址，否则保持 **Not Configured**，不会去连示例域名。文档里的 `relay.example.com` 只是说明 URL 形状。

不通过 App Store 分发。仓库默认 Ad-hoc 签名（`CODE_SIGN_IDENTITY = "-"`），`DEVELOPMENT_TEAM` 为空。不要把 Team ID、证书、描述文件或密码提交进仓库。本机要稳定钥匙串身份时，在 Xcode 里选自己的 Development Team 或 Developer ID，不要改仓库里的 Bundle ID。Ad-hoc 每次构建 cdhash 都会变，系统可能弹出钥匙串提示；这不是把凭据改回任意进程可读的理由。

## 打开与构建

```text
open macos/Mote.xcodeproj
```

或从仓库根目录：

```text
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -configuration Debug -destination 'platform=macOS' build
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -testPlan Mote-Safe -configuration Debug -destination 'platform=macOS' test
```

日常 Debug 可以用 Ad-hoc（Sign to Run Locally）。登录项和钥匙串要在多次构建之间保持同一身份时，在本机 Xcode 选择 Development Team。不要把签名材料提交进仓库。

`Mote-Safe` 是 scheme 的默认测试计划。它跑协议、连接生命周期、偏好和钥匙串用例，并跳过 `LockActionLiveTests`。注入闭包的 `LockActionTests` 不会锁屏。真实锁屏是 DEBUG **Test Lock**，不是 CI。发行签名见 [docs/release.md](../docs/release.md)。

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

应用图标在 `Mote/Resources/Assets.xcassets/AppIcon.appiconset/`。这套 PNG 是 Mote 的产品图标。Windows 的 `Mote.ico` 从其中的 16、32、64、128、256 像素文件生成，不另画一套。仓库根目录 README 使用的 `docs/mote-icon.png` 与 `icon_256x256.png` 是同一份文件。

## 运行时行为

1. 启动时加载持久的 `device_id` 和设置。
2. 缺少设备凭据 → 主窗口显示 **Mote is not configured**、**Relay URL** 和 **Pair**。不会假装已连接或显示虚假延迟。
3. 填入公网 Relay URL 后点 Pair，状态为 **Waiting for Approval…**。Dashboard 批准 → 凭据写入钥匙串并立刻连接，无需重启。
4. 凭据存在且已启用 Connect → 出站该基址上的 `wss://…/v1/ws/device`。
5. 仅在 `auth_result.status == "ok"` 之后才进入应用层 **Connected**。
6. 每 30 秒心跳一次；延迟是来自 `heartbeat_ack` 的近似 RTT。已连接标题旁显示 `Relay · 4 ms`。
7. 锁屏优先走登录会话，不依赖辅助功能。设置窗不再展示 Lock Permission。
8. 断开后按带抖动的指数退避（1–30 秒）重连。用户 **Disconnect**、应用退出、设备禁用、凭据轮换、无效凭据和协议版本不匹配会停掉自动重连。网络丢失、心跳过期、套接字失败、未知关闭原因、系统唤醒和网络恢复会重连。系统睡眠只暂停传输，不当成认证失败。锁屏命令不会拆掉 Relay 连接。
9. Dashboard **Disable** → 状态为 **Disabled**，立即停止重连。Dashboard Enable 后按 **Reconnect**（凭据未变）。不要 Pair。
10. Dashboard **Rotate credential** → 停止重连。Connection 区折叠 **Paste credential**，粘贴 Dashboard 显示的一次性新凭据后连接。已登记设备再 Pair 会 409。
11. 关闭设置窗口不会退出。**Quit Mote** 会停止重连、关闭套接字、取消心跳并退出。

连接状态文案：

```text
Not Configured
Waiting for Approval…
Connecting…
Authenticating…
Connected
Reconnecting…
Disconnected
Disabled
Connection Error
```

## 凭据

角色：`device_connection`（不是快捷指令的 `send_command` token）。

- 只存放在钥匙串，service 为 `com.nardo021.mote`，account 为 `device_connection`
- 若只有旧 service `com.example.mote` 里的项：先写入新 service，读回确认一致，再删旧项。写入或校验失败时保留旧项。明文不进日志
- `device_id` 仍是本机生成的 UUID。Bundle ID 变化时，会把旧偏好域 `com.example.mote` 里缺失的 `device_id`、设备名、连接意愿和 Relay URL 抄过来，不覆盖已经存在的值，也不删除旧偏好文件
- 凭据本身永不写入 UserDefaults、日志或源码
- 生产主路径是 **Pair**；已登记后凭据被轮换时，在 Connection 区折叠的 **Paste credential** 粘贴 Dashboard 给出的新值
- 快捷指令 token 不会被 Mote 保存。**Shortcuts** 区只预填 Device ID，token 输入框是助手，不持久化

### 与 Mote Relay 配对

1. 打开 Mote，把 **Relay URL** 填成你的公网基址（例如 `https://relay.example.com`），点 **Pair**。
2. Dashboard **Devices** 出现待批准请求，点 **Allow**。
3. Mac 实时写入钥匙串并连接。无需重启。

凭据轮换在 Dashboard 完成，然后在 Mac 折叠区粘贴新值。没有用来改线上数据库的 CLI。

### 临时 DEBUG 配对

开发时：

- DEBUG 设置 → **Developer** 区可以把设备凭据保存到钥匙串
- 可选环境变量：`MOTE_DEVICE_CREDENTIAL`（钥匙串为空时的 DEBUG 回退；除非你保存，否则不持久化）
- 可选 Relay 覆盖：设置里的 **Relay URL**，或 `MOTE_RELAY_URL`（本地 Wrangler 用 `http://127.0.0.1:8787`）。`MOTE_RELAY_URL` 优先。

DEBUG **Developer** 里的凭据和模拟命令会在 Release 中编译剔除。Relay URL 在 Release 中保留。不要在生产中关闭 TLS 校验。

## 应用沙盒

沙盒保持关闭（`ENABLE_APP_SANDBOX = NO`，entitlement `com.apple.security.app-sandbox` 为 false）。

锁屏主路径是 `login.framework` 的私有符号 `SACLockScreenImmediate`，失败时才回退到 `CGEvent` 的 Control-Command-Q。这两条都不是沙盒允许的公开 API。登录项是菜单栏应用自己（`SMAppService.mainApp`），没有单独的 helper。打开沙盒会拆掉当前要求的锁屏实现。钥匙串 ACL 与沙盒无关：凭据仍然只给创建它的应用，不向任意本地进程开放。

## 连接生命周期

`RelayClient` 是唯一的连接状态机：传输、认证、心跳、重连、睡眠和网络路径。`AgentCoordinator` 只决定要不要连。`AppState` 把状态投影到菜单栏和设置。手动启动和登录项启动都走 `applicationDidFinishLaunching` → `AppState.start()`。退出时先标记终止，再停观察者、心跳、重连和套接字，不删凭据，也不再预约重连。

系统将睡眠：停心跳和重连，状态为 Disconnected。系统已唤醒，或 `NWPathMonitor` 从不可用变为可用：若用户仍希望连接、凭据还在、且不是禁用或凭据类终止状态，立刻重连一次。同一次只保留一个连接代际。

## 锁屏动作与辅助功能

远程 `lock` 优先调用登录会话的 `SACLockScreenImmediate`。这条路径不需要辅助功能，也不模拟快捷键。

仅当会话锁屏不可用时，才回退到 **Control + Command + Q**，并检查 `AXIsProcessTrusted`。缺少信任时以 `permission_required` 干净失败，不会在每次启动时刷系统提示。

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
5. **使用 DEBUG Test Lock** — 标明会立即锁定这台 Mac。
6. **确认 Mac 锁屏** — 出现锁屏界面。
7. **重新打开会话** — 解锁后 Mote 仍在运行。
8. **检查 Start at Login 开关** — 反映 `SMAppService` 状态；可启用和关闭。
9. **检查菜单栏** — 彩色状态、设备名、Open Mote / 需要时 Reconnect / Quit。已连接时没有 Disconnect。
10. **设置开发用 Relay 凭据** — DEBUG 钥匙串保存或 `MOTE_DEVICE_CREDENTIAL`。
11. **尝试 Relay 连接** — Connect；Relay 运行且凭据匹配时，应看到 Authenticating 然后 Connected。没有 Relay 时，看到 Connecting / Authenticating / Connection Error / Reconnecting…，绝不能是假的 Connected。
12. **使用模拟命令** — 过期和错误设备的模拟被拒绝；有效的模拟锁屏在本地执行。
13. **确认命令校验** — 最近结果按情况显示 `expired` / `invalid` / `unsupported`。
14. **退出 Mote** — 进程退出；重连停止。

## 界面

视觉规范以仓库根目录的 [`design.md`](../design.md) 为准。Mote for Mac 是紧凑的原生菜单栏工具，而不是仪表盘或营销页。

### 主窗口

默认约 `520 × 560`，最小约 `460 × 480`。内容最大宽度 520 px。内容按纵向分组：

- 设备名在左，状态靠右；已连接时显示 `Relay · 4 ms`
- **Connection** — 可编辑 Relay URL 与延迟；未配置时不显示。断开 / 禁用 / 凭据失效后主按钮为 **Reconnect**。轮换或无效凭据时出现折叠的 **Paste credential**
- **Startup** — Start Mote at Login，绑定真实的 `SMAppService` 状态
- **Device** — 可编辑设备名、缩写 Device ID、复制完整 ID、Version
- **Shortcuts** — 说明 + **Open Shortcut Setup**（复制 Device ID 并打开 `/s/:deviceId`）

未配置顺序：状态头 → Setup（Relay URL + Pair）→ Device → Startup → Shortcuts。不要显示 Connection，也不要第二遍状态标题。配对中头为 **Waiting for Approval…**。

### 菜单栏

菜单栏是日常主界面。图标是自定义中继标记，右下角用颜色圆点表示状态（不是 SF Symbol template）。菜单只保留彩色状态、设备名，以及 Open Mote / 需要时 Reconnect / Quit Mote。已连接时不放 Disconnect。未配置时显示 **Mote is not configured**。Relay、权限和登录项在主窗口。

### Debug / Advanced

DEBUG 构建设置底部有折叠的 **Advanced**：解析后的 Relay Endpoint、协议版本、连接状态、命令 ID、开发凭据、模拟命令和 Test Lock。这部分 Release 会编译剔除。Relay URL 字段在正常设置里，Release 保留。正常界面不显示凭据、Bearer token 或钥匙串内容。

## 协议

见 [docs/protocol.md](../docs/protocol.md)。

```text
wss://<relay-host>/v1/ws/device
CONNECT → auth → auth_result → heartbeat ↔ heartbeat_ack → command → command_result
```

配对：

```text
POST /v1/pair/requests
wss://<relay-host>/v1/ws/pair
pair_auth { request_id, pair_secret }
```

时间戳为 Unix 纪元毫秒。默认命令 TTL 为 10 秒。Mac 侧认证超时约 10 秒。

## 本阶段不包含

- 在 iPhone 上静默安装已填 token 的快捷指令（见 [docs/shortcuts.md](../docs/shortcuts.md)）
- 原生 iOS 应用（计划见 [docs/ios.md](../docs/ios.md)）
- Bonjour / 本地 TCP / BLE
- 任意 shell、AppleScript 或可执行路径执行
