# Windows 发行验收

自动化作业可以启动已发布的 `Mote.Windows.exe`、确认第二个实例不会留下来，并在结束后清掉进程。下面这些要在真实的 Windows 桌面上对 **发布产物** 做，不要对 `dotnet run` 的开发构建做。CI 不执行会锁屏、断网或休眠的项目。

这些项都还没有做。状态是 `WINDOWS_INTERACTIVE_ACCEPTANCE_NOT_RUN`。不要把自动化冒烟写成通过。

| 项 | 方式 | 结果 |
| --- | --- | --- |
| 正常启动发布出的 `Mote.Windows.exe` | 手动 | NOT RUN |
| 托盘图标出现 | 手动 | NOT RUN |
| 设置窗口能打开 | 手动 | NOT RUN |
| 关掉设置窗口是隐藏，不是退出 | 手动 | NOT RUN |
| 关掉窗口后托盘还在 | 手动 | NOT RUN |
| Open Mote 把设置窗口带回前面 | 手动 | NOT RUN |
| 再手动启动一次会激活已有实例 | 手动 | NOT RUN |
| 再以 `--background` 启动不会出现第二个主进程 | 手动。自动化只检查进程会退出 | NOT RUN |
| 保存 Relay URL | 手动 | NOT RUN |
| Pair Device | 手动 | NOT RUN |
| Dashboard 批准 | 手动 | NOT RUN |
| 进入 Connected | 手动 | NOT RUN |
| Disconnect | 手动 | NOT RUN |
| Connect | 手动 | NOT RUN |
| 打开和关闭登录启动 | 手动 | NOT RUN |
| Quit 去掉托盘并结束进程 | 手动 | NOT RUN |
| 凭据恢复 | 手动 | NOT RUN |
| 断网后的恢复，且只有一次恢复 | 手动。不要写进 CI | NOT RUN |
| 真实休眠 / 唤醒 | 手动。不要写进 CI | NOT RUN |
| 远程锁屏一次，而且必须是有意做的 | 手动。不要写进 CI | NOT RUN |

真实锁屏的单独状态是 `REAL_WINDOWS_LOCK_RELEASE_SMOKE_NOT_RUN`。正式图标还没有放进工程，状态是 `FINAL_WINDOWS_ICON_PENDING`。
