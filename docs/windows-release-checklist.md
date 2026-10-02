# Windows 发行验收

这些项要在真实的 Windows 桌面上，对 **2.0.0 候选包里实际发布出的** `Mote.Windows.exe` 做。路径是：

```text
windows/src/Mote.Windows/bin/Release/net10.0-windows/win-x64/publish/Mote.Windows.exe
```

不要对 `dotnet run` 或未发布的 Debug 构建做。自动化作业可以启动这个已发布程序、确认第二个实例不会留下来，并在结束后清掉进程。那不是下面这份清单的通过。CI 不执行会锁屏、断网或休眠的项目。

状态是 `WINDOWS_INTERACTIVE_ACCEPTANCE_PASSED`。日期是 2026-10-02。环境是 Windows 11 Pro 25H2，内部版本 `26200.8875`，x64，主屏 3440×1440，缩放 100%。代码提交是 `707aad0244317cc25f2905d80cd492945e07f1e3`，CI 是 [36951751688](https://github.com/Nardo021/Mote/actions/runs/36951751688)。Relay 是 `https://mote-rc.raspy-heart-8d21.workers.dev`。发行程序版本 2.0.0，未签名。

| 项 | 方式 | 结果 |
| --- | --- | --- |
| 正常启动发布出的 `Mote.Windows.exe` | 手动 | PASS |
| 设置窗口显示 Mote 图标 | 手动 | PASS |
| 任务栏在适用时显示 Mote 图标 | 手动 | PASS |
| 通知区域显示 Mote 图标 | 手动 | PASS |
| 正常 Windows 缩放下托盘图标可以辨认 | 手动 | PASS |
| 双击托盘或 Open Mote 打开设置 | 手动 | PASS |
| 关掉设置窗口是隐藏，不是退出 | 手动 | PASS |
| 关掉窗口后托盘还在 | 手动 | PASS |
| 再手动启动一次会激活已有实例 | 手动 | PASS |
| 再以 `--background` 启动不会出现第二个实例 | 手动。自动化只检查进程会退出 | PASS |
| 保存 Relay URL | 手动 | PASS |
| Pair Device | 手动 | PASS |
| 在 Dashboard 里批准 | 手动 | PASS |
| 进入 Connected | 手动 | PASS |
| Disconnect | 手动 | PASS |
| Connect | 手动 | PASS |
| 打开 Launch at login | 手动 | PASS |
| 关闭 Launch at login | 手动 | PASS |
| 凭据恢复 | 手动 | PASS |
| 真实断网后的恢复，且只有一次恢复 | 手动。不要写进 CI | PASS |
| 真实休眠 / 唤醒 | 手动。不要写进 CI | PASS |
| 有意做一次远程锁屏 | 手动。不要写进 CI | PASS |
| 解锁后 Mote 重连或仍然健康 | 手动。不要写进 CI | PASS |
| Quit Mote 去掉托盘并结束进程 | 手动 | PASS |

真实断网恢复是 `REAL_NETWORK_DISRUPTION_EXECUTED`。真实休眠 / 唤醒是 `REAL_WINDOWS_SUSPEND_EXECUTED`。真实锁屏是 `REAL_WINDOWS_LOCK_EXECUTED`：操作者看见 Windows 被锁定，并报告这次锁屏行为正确。解锁后的健康检查按该报告记为 PASS。

凭据恢复使用 Dashboard 的「轮换凭证」。新凭据只在对话框里显示一次，复制后写入 Windows Advanced 的 `Save credential & reconnect`。设备回到 Connected，Dashboard 显示在线，设备 ID 不变，没有重新配对。`%LOCALAPPDATA%\Mote\settings.json` 不含凭据。Windows Credential Manager 仍有目标 `com.nardo021.mote/device_connection`。

Quit Mote 从托盘执行。托盘图标消失，设置窗口消失，`Mote.Windows` 进程退出，没有残留进程，Dashboard 变为离线。Relay URL、设备 ID、凭据和配对状态都还在。随后启动同一个发布程序：设置和托盘正常，不需要重新配对，因 `wants_connection` 仍为真而重新连接，Dashboard 在线，且只有一个进程。

应用图标已经按现有 Mote 画稿嵌进发布出的 `Mote.Windows.exe`，结构状态是 `FINAL_WINDOWS_ICON_READY`。上表里的图标外观是在 100% 缩放下人工看过的 PASS。
