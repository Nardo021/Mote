# Mote iOS

原生 iPhone 应用**尚未进仓库**。本文记录个人使用约定，以及它如何接到已经落地的 Relay。

当前 iPhone 触发方式仍是 Apple 快捷指令，见 [shortcuts.md](shortcuts.md)。

## 目标

一台 Mac、一台 iPhone、只给自己用。

- 用付费 Apple Developer 账号在 Xcode 里装到自己的手机。
- 不上架 App Store，也不走 TestFlight（构建大约 90 天过期，对自己更麻烦）。
- 证书大约一年有效。日常打开不用重装。
- 更新版本：改完代码，把 Version / Build 加一，再点一次 **Run**。同一个 Bundle ID 会覆盖旧版本。
- 走现有 `send_command` HTTPS API，不另起命令协议。
- 不要为了「方便」去打 `192.168.2.44` 或开发机回环地址。

## 为什么不是 7 天重装

7 天失效属于**免费 Apple ID / Personal Team**。

Xcode **Settings → Accounts** 里的 Team 必须是付费 Apple Developer Program，不能是 Personal Team。工程 Signing 选这个 Team，并勾选 Automatically manage signing。

不要把 Team ID 或描述文件 UUID 提交进仓库。

## 和现有系统怎么接

实现后的路径：

```text
Mote iOS
      │
      │ POST https://relay.yanze.me/v1/devices/:deviceId/commands
      │ Authorization: Bearer <send_command token>
      │ {"action":"lock"}
      ▼
Mote Relay
      │
      │ 已认证 WebSocket
      ▼
Mote Agent → macOS 锁屏
```

HTTP 形状与快捷指令相同，见 [protocol.md](protocol.md)。

活动来源：

| `source`    | 谁在发令                     | 状态   |
| ----------- | ---------------------------- | ------ |
| `shortcut`  | 公开命令 API（当前快捷指令） | 已实现 |
| `dashboard` | 管理员在 Dashboard 点 Lock   | 已实现 |
| `ios`       | 原生 iOS 客户端              | 已预留 |

公开 `POST /v1/devices/:deviceId/commands` 现在一律记成 `shortcut`。等 iOS 客户端落地时，再让这条路径（或单独的受信任入口）写入 `ios`。在此之前不要假装 Activity 里已经有 iOS 记录。

iOS 使用的 token 仍然是 `send_command`。不要把 Mac 的 `device_connection` 放进手机。

## 建议的工程形状

仓库里还没有 `ios/`。落地时建议：

```text
ios/
├── Mote.xcodeproj
├── Mote/
└── MoteTests/
```

建议 Bundle ID：`me.yanze.mote.ios`（实现时再定）。Mac 已占用 `me.yanze.mote`。

最低系统版本与具体屏幕以实现为准。视觉语言仍遵守仓库根目录 [design.md](../design.md)：克制、原生、状态清楚。

## 本机安装与更新

1. 用付费 Apple ID 登录 Xcode。
2. 打开 iOS 工程，Team 选付费账号。
3. iPhone 用数据线连上（或已配好无线调试），点 **Run**。
4. 第一次会装上 App。之后改代码再 Run，就是更新，不是卸了重装。
5. 本地数据（token、Device ID）在 Bundle ID 不变时应保留。
6. 大约一年后证书过期：同一台 Mac 打开工程，连上手机再 Run 一次。

不要：

- 用免费 Personal Team（大约 7 天失效）
- 为自己一个人上 TestFlight
- 把 `.ipa` 公开分发给不认识的人
- 把 token、Team ID、描述文件写进 Git

## 实现时不要做的事

- 不要另起一套命令 JSON。
- 不要实现 Bonjour / 本地直连（那是更后面的阶段）。
- 不要在 iOS 里保存 `device_connection`。
- 不要关闭生产 TLS 校验。
- 不要把局域网 IP 写进 Release 配置。
- 不要做 App Store 截图、审核元数据或 IAP。

## 验证（实现之后）

1. 付费 Team 签过的 Debug 构建能装到自己的 iPhone。
2. 用同一 token 发 `lock`，Mac 在线且已授权时应返回 `completed`。
3. Mac 离线时看到明确的 `offline`，命令不排队。
4. 再 Run 一次后，App 更新且 token 还在。
5. 不要出现 7 天就无法打开的情况。
