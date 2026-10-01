# Mote 2.0.0

Mote 2.0.0 把 Mac 和 Windows 收成同一个产品版本。协议仍是 v1，唯一动作仍是 `lock`。

- Relay 使用 Cloudflare Worker 和 Durable Object。
- 设备凭据按设备隔离，保存在 Mac Keychain 或 Windows Credential Manager。
- Shortcut token 只用于快捷指令，不能代替设备凭据。
- Mac Agent 的生命周期已经收紧。
- Windows Agent 可以配对、连接、锁屏，并带托盘和设置窗口。
- Windows 在网络变化和系统电源事件后会按代次重连。
- Windows 发行形态是 win-x64、自包含、单文件、便携 zip。没有安装包，也没有自动更新。
- Mac 与 Windows 使用仓库里已有的同一套应用图标。Windows 图标嵌在 `Mote.Windows.exe` 里。

这次草稿不表示 GitHub Release 已经存在，也不表示两边都已经用受信任证书签过名。没有受信任的 Windows 签名时，统一发版会失败，不会只发布 Mac。
