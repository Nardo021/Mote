# Mote for Windows

Mote for Windows 是第二套原生 Agent。它使用仓库里已有的 Mote Relay 和 Protocol v1，不另起 Relay，也不定义 Protocol v2。

**状态：W1 基础。还不能用于生产。** 这一阶段有工程、协议模型、设置和安全边界，以及不会锁屏的测试。配对、Windows Credential Manager、已认证的 WebSocket、心跳和 `command_result` 发送都还没做。

## 它是什么

- 普通的每用户桌面应用，跑在已登录的交互会话里。以后会收成托盘应用。
- 不是 Windows 服务，不要求管理员权限，也不做会话 0。
- 唯一动作是 `lock`，经 Win32 `LockWorkStation()`。没有 shell、PowerShell、`rundll32` 或任意命令执行。
- 认证帧的 `platform` 是 `windows`，`actions` 只有 `lock`。契约样例是 `protocol/fixtures/auth-windows.json`。
- `device_id` 是软件生成的 UUID，不取机器 SID、主板序列号、MAC、TPM 或硬件 UUID。
- 设置写在 `%LOCALAPPDATA%\Mote\settings.json`。凭据不会进这个文件。
- 凭据的生产目标是 Windows Credential Manager，TargetName 为 `com.nardo021.mote/device_connection`。W1 只固定这个边界，拒绝把凭据写到磁盘。

## 开发

需要 .NET 10 SDK。在 `windows/` 目录：

```text
dotnet restore
dotnet build
dotnet test
```

`dotnet test` 不调用 `LockWorkStation()`，也不会改当前用户的注册表启动项。GitHub Actions 的 Windows job 在 `windows-latest` 上执行同样的 restore、build、test。

本地 Worker 仍是 `http://127.0.0.1:8787`。W1 还不会连上它。
