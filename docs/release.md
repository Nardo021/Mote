# 发布

应用版本和协议版本是两件事。

| 名字 | 现在的值 | 含义 |
| --- | --- | --- |
| 产品版本 | 2.0.0 | Mac `MARKETING_VERSION` 和 Windows `Version`。用户看到的是同一个 Mote 版本 |
| `CURRENT_PROJECT_VERSION` | 15 | 只属于 Mac 的构建号。从 14 加 1，不重置，也不用协议版本 |
| Windows `FileVersion` | 2.0.0.0 | Windows 没有单独的递增构建号。文件版本用产品版本加 `.0` |
| `protocol/catalogue.json` `version` | 1 | 线上协议。保持 v1 |
| `relay` / `dashboard` 的 `package.json` `version` | 1.0.0 | 私有包元数据，不是产品发行版号 |

产品版本和构建号是两件事。Mac 的构建号继续单独增加。Windows 不另维持一套构建号。协议版本不跟着产品版本走。

公开发版只用一个 tag：`v2.0.0`。不要再拆 `mac-v2.0.0` 或 `windows-v2.0.0`。这次没有创建这个 tag，也没有创建 GitHub Release。

## 自动更新

`NO_AUTO_UPDATER_YET`

当前规模用手动 GitHub Release 就够。Sparkle 会多出：

- Developer ID 签名和公证仍然是前提
- 一个更新 feed，以及 feed 的托管和签名
- 应用内下载、替换和重启
- 更多攻击面：feed 被篡改、降级、错误的更新包
- 持续维护 appcast 和版本线

没有“用户必须自动更新”的产品要求之前，不加 Sparkle。

## macOS 产物

菜单栏应用用一个 zip 里的 `Mote.app`。不需要 pkg 安装器，也不为了多一种格式再做 dmg。

路径：

```text
源码
  → 干净的 Release archive
  → Developer ID Application 签名
  → Hardened Runtime（保持打开）
  → App Sandbox（保持关闭）
  → 导出 .app
  → codesign --verify --deep --strict
  → 提交公证
  → stapler
  → zip + SHA-256
  → 交给统一发版工作流
```

`.github/workflows/release-macos.yml` 只由 `.github/workflows/release.yml` 调用。它签名、公证、打包并上传构建产物。它不再自己创建 GitHub Release。Apple 密钥只在这个 Mac 作业的 `macos-release` 环境里检查。统一发版的预检不读取这些密钥。仓库里还没有受信任的 Windows 签名，所以预检在核对版本之后失败，Mac 作业不会开始。

这次没有运行该工作流。公证状态是 `NOTARIZATION_NOT_EXECUTED`。Mac 生产签名是 `MACOS_PRODUCTION_SIGNING_NOT_EXECUTED`。Windows 受信任签名是 `WINDOWS_PRODUCTION_SIGNING_NOT_EXECUTED`。

## 密钥

放在 GitHub Environment `macos-release` 的 Secrets 里。不要写进仓库。

| Secret | 用途 |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | Developer ID Application 证书，base64 后的 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | 该 p12 的密码 |
| `APPLE_TEAM_ID` | Apple Team ID。仓库里不写具体值 |
| `APPLE_API_KEY_ID` | App Store Connect API key id |
| `APPLE_API_ISSUER_ID` | API issuer id |
| `APPLE_API_KEY_P8` | API 私钥 `.p8` 的 base64 |

临时钥匙串密码由工作流当场生成，不入库，也不写进日志。公证用 `notarytool` 和 App Store Connect API key，不用 Apple ID 密码。

工作流不会打印 API token、证书密码或 p8。

## Hardened Runtime 和沙盒

工程里 `ENABLE_HARDENED_RUNTIME = YES`，`ENABLE_APP_SANDBOX = NO`。entitlement 只有 `com.apple.security.app-sandbox` = false。没有 `com.apple.security.cs.disable-library-validation`。

出站网络在非沙盒应用上不需要额外 entitlement。登录项是 `SMAppService.mainApp`，不是 helper。

锁屏调用私有 `login.framework` 的 `SACLockScreenImmediate`，失败才回退到 `CGEvent`。系统框架由 Apple 签名，Hardened Runtime 的库校验通常允许从系统路径 `dlopen`。这不能推出 Apple 公证一定会接受调用私有符号的二进制。公证没有在这里执行。如果公证因为私有 API 拒绝，应把拒绝原文记下来，而不是关掉 Hardened Runtime 或换掉 `LockAction`。

CI 用 ad-hoc 身份（`CODE_SIGN_IDENTITY=-`）编译和跑安全测试，不注入 Developer ID。

这次没有运行 macOS 发行工作流，也没有：

- 用 Developer ID 签名
- `codesign --verify`
- 公证、装订
- 打 macOS zip 发行包
- 创建 GitHub Release

公证状态仍是 `NOTARIZATION_NOT_EXECUTED`。

## Windows 产物

`NO_INSTALLER_YET`

`NO_MSIX_YET`

Windows 发行目标是 `win-x64` 的自包含单文件 `Mote.Windows.exe`，打成 `Mote-Windows-x64-<version>.zip`。不发布 x86。没有在真实 ARM64 Windows 上运行过，所以不把 `win-arm64` 写成支持的目标。不做 MSIX，也不做 MSI、Inno、WiX 或 NSIS。这些以后仍可以加。

发布配置在 `Mote.Windows.csproj` 里，只在带 RuntimeIdentifier 的 publish 上生效。可复现命令：

```text
dotnet publish windows/src/Mote.Windows/Mote.Windows.csproj -c Release -r win-x64 --self-contained true
```

`PublishSingleFile` 打开，`PublishTrimmed` 和 ReadyToRun 关闭。不使用 NativeAOT。用户不需要另装 .NET Desktop Runtime。公开 zip 里不放 PDB。版本号由 `scripts/windows-release-version.mjs` 从工程读出，拒绝不合 `major.minor.patch` 的值。

`.github/workflows/build-windows-release.yml` 可以手动运行，CI 也会以测试模式调用它。它不监听 `vX.Y.Z`，也不创建 GitHub Release。`mode=test` 上传的是 `UNSIGNED_RC`。统一发版以 `mode=production` 调用它；没有受信任签名时失败，不会改成未签名包再发布。测试用的自签证书只存在于当次作业里，签的是一份会被删掉的副本，不会进入 zip。正式发布要求清单里的 `signing_status` 是 `PRODUCTION_SIGNED`。

便携包的更新是手动的：退出 Mote，换掉可执行文件，再启动。如果路径变了，要重新打开 Launch at login。配对和设置不在可执行文件旁边，而在 `%LOCALAPPDATA%\Mote\settings.json` 和 Windows Credential Manager 里，替换程序不会清掉它们。程序被挪走或删掉之后，原来的 Run 键会变成失效项。这次不用安装器去解决这件事。

`NO_AUTO_UPDATER_YET` 同样适用于 Windows。

应用图标用仓库里已经有的那套画稿。Mac 的 `AppIcon.appiconset` 是权威来源。Windows 的 `Mote.ico` 由 `scripts/build-windows-icon.mjs` 从其中 16、32、64、128、256 像素的 PNG 生成，并作为 `ApplicationIcon` 嵌进 `Mote.Windows.exe`。状态是 `FINAL_MACOS_ICON_READY` 和 `FINAL_WINDOWS_ICON_READY`。图标结构就绪不代替签名、公证或手动验收。

验收清单见 [windows-release-checklist.md](windows-release-checklist.md)。签名见 [code-signing.md](code-signing.md)。
