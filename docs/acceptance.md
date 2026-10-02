# 跨平台验收

自动化结果和真实设备上的手动结果分开写。单元测试里的假锁屏、假断网和假休眠不是真实设备通过。

| 行为 | macOS | Windows |
| --- | --- | --- |
| 配对 | NOT RUN | PASS |
| 凭据安全存储 | NOT RUN | PASS |
| 认证 | NOT RUN | PASS |
| 心跳 | NOT RUN | PASS |
| 锁屏 | NOT RUN | PASS |
| 断开 | NOT RUN | PASS |
| 重连 | NOT RUN | PASS |
| 网络恢复 | NOT RUN | PASS |
| 睡眠 / 唤醒 | NOT RUN | PASS |
| 登录启动 | NOT RUN | PASS |
| 单用户会话 Agent | NOT RUN | PASS |
| 发行产物 | NOT RUN | PASS |
| 受信任签名 | BLOCKED | BLOCKED |
| 手动发行验收 | NOT RUN | PASS |
| 应用图标 | FINAL_MACOS_ICON_READY | FINAL_WINDOWS_ICON_READY |

Windows 手动发行验收是 `WINDOWS_INTERACTIVE_ACCEPTANCE_PASSED`。环境是 Windows 11 Pro 25H2，内部版本 `26200.8875`，x64，主屏 3440×1440，缩放 100%。代码提交是 `707aad0244317cc25f2905d80cd492945e07f1e3`，CI 是 [36951751688](https://github.com/Nardo021/Mote/actions/runs/36951751688)。桌面上使用的 `Mote.Windows.exe` 是该提交里未改动的 Windows 源码所对应的 Release 发布程序，版本 2.0.0，未签名。临时验收 Relay 是 `https://mote-rc.raspy-heart-8d21.workers.dev`。

人工确认了真实断网后的恢复（`REAL_NETWORK_DISRUPTION_EXECUTED`）、真实休眠和唤醒（`REAL_WINDOWS_SUSPEND_EXECUTED`），以及一次真实远程锁屏（`REAL_WINDOWS_LOCK_EXECUTED`）。锁屏时操作者看见 Windows 被锁定。解锁后的健康检查随这次锁屏报告记为 PASS。凭据轮换后，Dashboard 只显示一次新凭据；Windows 在 Advanced 里保存并重连，设备 ID 没有变，没有重新配对。托盘 Quit Mote 会结束进程并保留 Relay URL、设备 ID 和凭据；再用同一发布程序启动后会按已保存的连接意图重连，且只有一个进程。

Mac 的协议和 safe 测试留在 CI。签名、公证和手动验收没有在这台机器上执行。

Mac 应用图标是 `macos/Mote/Resources/Assets.xcassets/AppIcon.appiconset/` 里已经提交的 PNG。Windows 的 `Mote.ico` 从这套画稿生成，并嵌进发布的 `Mote.Windows.exe`。`docs/mote-icon.png` 与其中的 256 像素图标是同一份文件。`FINAL_MACOS_ICON_READY` 和 `FINAL_WINDOWS_ICON_READY` 表示结构集成完成。Windows 桌面上的图标外观已在上述环境里人工看过。

公开发版仍被这些项挡住：Windows 受信任签名（`WINDOWS_PRODUCTION_SIGNING_NOT_EXECUTED`）、Mac 生产签名（`MACOS_PRODUCTION_SIGNING_NOT_EXECUTED`）、Mac 公证（`NOTARIZATION_NOT_EXECUTED`）、Mac 手动验收（`MACOS_MANUAL_ACCEPTANCE_NOT_RUN`）。
