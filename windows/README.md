# Mote for Windows

Mote for Windows 是第二套原生 Agent。它使用仓库里已有的 Mote Relay 和 Protocol v1，不另起 Relay，也不定义 Protocol v2。

**状态：W2 核心运行时。还不能用于生产。** 这一阶段能配对、把设备凭据写入 Windows Credential Manager、建立已认证的设备 WebSocket、发送心跳，并经现有校验执行 `lock`、回传 `command_result`。托盘、设置界面、安装包、签名和网络/休眠生命周期还没做。窗口只说明进程在运行，不能从界面上配对。

## 它是什么

- 普通的每用户桌面应用，跑在已登录的交互会话里。以后会收成托盘应用。
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

## 开发

需要 .NET 10 SDK。在 `windows/` 目录：

```text
dotnet restore
dotnet build
dotnet test
```

`dotnet test` 不调用 `LockWorkStation()`。凭据测试使用 `com.nardo021.mote.test/<uuid>`，用完删除，不写生产 TargetName。GitHub Actions 的 Windows job 在 `windows-latest` 上执行同样的 restore、build、test。

本地 Worker 仍是 `http://127.0.0.1:8787`。W2 的单元测试使用假 HTTP 和假传输，还不包含对真实 Worker 的端到端配对。
