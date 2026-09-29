# 发布

应用版本和协议版本是两件事。

| 名字 | 现在的值 | 含义 |
| --- | --- | --- |
| `MARKETING_VERSION` | 1.5.6 | Mote for Mac 的用户可见版本。Phase 5 没有因为发布工程而抬版本 |
| `CURRENT_PROJECT_VERSION` | 14 | 构建号 |
| `protocol/catalogue.json` `version` | 1 | 线上协议。保持 v1 |
| `relay` / `dashboard` 的 `package.json` `version` | 1.0.0 | 私有包元数据，不是 Mac 发行版号 |

下次真正发布时，只抬 Mac 的 marketing version 和 build。协议有不兼容改动时才另开版本，那不是这次的事。

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
  → GitHub Release
```

`.github/workflows/release-macos.yml` 只在手动触发或 `vX.Y.Z` tag 上运行。tag 必须等于 `v` 加 `MARKETING_VERSION`。普通提交和 pull request 不会发布。缺少下面任一密钥时，任务直接失败，不上传未签名包。

这次实现没有运行该工作流。公证状态是 `NOTARIZATION_NOT_EXECUTED`。

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

## 这次没有做的事

- 没有签名
- 没有 `codesign --verify`
- 没有公证、装订
- 没有打 zip 发行包
- 没有创建 GitHub Release
