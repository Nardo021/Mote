# Mote for Windows

Mote for Windows 是第二套原生 Agent。它使用仓库里已有的 Mote Relay 和 Protocol v1，不另起 Relay，也不定义 Protocol v2。

**状态：可用的 Windows Agent，带托盘和设置窗口；安装包和签名还没有。** 核心能配对、把设备凭据写入 Windows Credential Manager、建立已认证的设备 WebSocket、发送心跳，并经现有校验执行 `lock`、回传 `command_result`。网络中断和系统休眠会立刻作废当前连接代次，条件允许时再重连。平时收在通知区域里。这还不是可下载的正式发行包。

## 它是什么

- 普通的每用户托盘应用，跑在已登录的交互会话里。不是任务栏里的主窗口。
- 不是 Windows 服务，不要求管理员权限，也不做会话 0。
- 唯一动作是 `lock`，经 Win32 `LockWorkStation()`。没有 shell、PowerShell、`rundll32` 或任意命令执行。
- 认证帧的 `platform` 是 `windows`，`actions` 只有 `lock`。契约样例是 `protocol/fixtures/auth-windows.json`。
- `device_id` 是软件生成的 UUID，不取机器 SID、主板序列号、MAC、TPM 或硬件 UUID。
- 设置写在 `%LOCALAPPDATA%\Mote\settings.json`。凭据不会进这个文件。
- 设备凭据只进 Windows Credential Manager。生产 TargetName 是 `com.nardo021.mote/device_connection`，类型是 `CRED_TYPE_GENERIC`。原生调用失败就失败，不改写到设置、注册表或别的文件。

## 运行时

`RelayClient` 是唯一的连接状态机。一次真实连接尝试有一个代次。旧代次的收包、认证超时、心跳、关闭和命令回执不能改写新连接。

配对走现有的 `POST /v1/pair/requests`，然后连接 `/v1/ws/pair`。第一条协议帧是 `pair_auth`。`pair_secret` 不进 URL、查询字符串、日志或设置。批准后先写入 Credential Manager，写入成功才算配对完成。

设备通道是 `/v1/ws/device`。连接后立刻发送 `auth`。认证成功才开始 30 秒心跳。传输失败按现有退避重连。`invalid_credentials`、`unsupported_version`、`device_disabled` 和 `credential_rotated` 停止自动重连。显式断开也会停止重连，并且不会清掉凭据，除非用户取消的是尚未批准的配对。

启动时如果 `wants_connection` 为真，并且 Relay URL 和凭据都在，才连接。没有凭据不会崩溃，也不会自己开始配对。

网络和电源监视只负责报告系统事件。`RelayClient` 决定要不要连接。当前网络不可用时不会发起 WebSocket，也不会进入普通重连退避；网络恢复后立刻尝试一次。休眠会关掉当前套接字并停掉心跳，唤醒后同样立刻尝试一次。用户明确断开，以及 `invalid_credentials`、`unsupported_version`、`device_disabled`、`credential_rotated` 这些终止状态，都不会被系统事件重新打开。进程退出不会把 `wants_connection` 改成 false。

## 托盘和设置

手动启动 `Mote.Windows.exe` 会成为这个交互会话里的唯一实例，启动 Agent，显示托盘图标，并打开设置窗口。登录启动使用同一个程序加 `--background`：有托盘，不自动打开设置。再启动一次手动副本不会再建一个 Agent，只会让已经在跑的实例把设置窗口带到前面。再启动一次 `--background` 会直接退出。

关掉设置窗口只是隐藏它。Agent、托盘、WebSocket 和心跳都继续。只有托盘里的 **Quit Mote** 会停止 Agent 并退出进程。退出不会把 `wants_connection` 改成 false，所以下次启动仍会按原来的意愿连接。系统注销或关机时会尽量关掉托盘并停止 Agent，同样不改连接意愿，也不删凭据。

托盘菜单是状态、**Open Mote**、**Connect** 或 **Disconnect**、**Quit Mote**。状态用日常说法，不出现 WebSocket、Durable Object 或协议帧的名字。不会为每次重连或心跳弹通知。

设置窗口里可以保存 Relay URL、连接或断开、查看设备 ID 并复制。断开只停止远程会话，设备仍然保持已配对，凭据还在。没有凭据时可以 **Pair Device**。配对请求发出后，窗口会提示到 Mote Dashboard 里批准，也可以取消。取消会走现有的配对取消路径，不会留下凭据。已经配对的设备不能在这里改名；改名在 Dashboard 里做。已经在 Relay 注册过的设备 ID 不能靠本地“重新配对”绕过去。

`invalid_credentials` 和 `credential_rotated` 可以在 Advanced 里粘贴 Dashboard 给出的新凭据。输入框默认不显示明文，保存后清空，只写入 Credential Manager，不进 `settings.json`，也不写日志。保存成功后会按显式连接再连一次。`device_disabled` 要先在 Dashboard 里重新启用，换凭据不是解决办法。`unsupported_version` 只提示版本不兼容，不提供凭据输入。

**Launch Mote at login** 读写当前用户的 Run 键，值的形状是带引号的程序路径加 `--background`。注册表才是实际状态：写入失败时不会把设置标成已启用。在 `dotnet` 下面跑开发构建时，这个开关不可用，也不会写入一条错误的启动项。正常测试不修改当前用户真正的 `Mote` 启动项。

设置文件损坏时，窗口给出非致命提示。凭据不会因为设置 JSON 坏了就被删掉。

## 开发

需要 .NET 10 SDK。在 `windows/` 目录：

```text
dotnet restore
dotnet build
dotnet test
```

`dotnet test` 跑 `Mote.Windows.sln`，不启动 Wrangler，也不调用锁屏 API。凭据测试使用 `com.nardo021.mote.test/<uuid>`，用完删除，不写生产 TargetName。GitHub Actions 的 Windows job 在 `windows-latest` 上执行同样的 restore、build、test。

对真实本地 Relay 的端到端测试在另一个项目里。它会启动隔离的 Wrangler，只应在仓库根目录已经执行 `npm ci`、`npm ci --prefix relay` 和 `npm run build --prefix dashboard` 之后运行：

```text
dotnet test windows/tests/Mote.Windows.IntegrationTests/Mote.Windows.IntegrationTests.csproj
```

这条路径使用回环上的真实 Worker、Durable Object 和 WebSocket。Credential Manager 目标是 `com.nardo021.mote.e2e/<uuid>`，设置写在临时目录。锁屏边界是测试替身，不会锁住当前会话。GitHub Actions 的 Windows E2E job 单独运行这个项目。
