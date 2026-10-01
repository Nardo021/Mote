# Windows 发行验收

这些项要在真实的 Windows 桌面上，对 **2.0.0 候选包里实际发布出的** `Mote.Windows.exe` 做。路径是：

```text
windows/src/Mote.Windows/bin/Release/net10.0-windows/win-x64/publish/Mote.Windows.exe
```

不要对 `dotnet run` 或未发布的 Debug 构建做。自动化作业可以启动这个已发布程序、确认第二个实例不会留下来，并在结束后清掉进程。那不是下面这份清单的通过。CI 不执行会锁屏、断网或休眠的项目。

这些项都还没有做。状态是 `WINDOWS_INTERACTIVE_ACCEPTANCE_NOT_RUN`。不要把自动化冒烟写成通过。

| 项 | 方式 | 结果 |
| --- | --- | --- |
| 正常启动发布出的 `Mote.Windows.exe` | 手动 | NOT RUN |
| 设置窗口显示 Mote 图标 | 手动 | NOT RUN |
| 任务栏在适用时显示 Mote 图标 | 手动 | NOT RUN |
| 通知区域显示 Mote 图标 | 手动 | NOT RUN |
| 正常 Windows 缩放下托盘图标可以辨认 | 手动 | NOT RUN |
| 双击托盘或 Open Mote 打开设置 | 手动 | NOT RUN |
| 关掉设置窗口是隐藏，不是退出 | 手动 | NOT RUN |
| 关掉窗口后托盘还在 | 手动 | NOT RUN |
| 再手动启动一次会激活已有实例 | 手动 | NOT RUN |
| 再以 `--background` 启动不会出现第二个实例 | 手动。自动化只检查进程会退出 | NOT RUN |
| 保存 Relay URL | 手动 | NOT RUN |
| Pair Device | 手动 | NOT RUN |
| 在 Dashboard 里批准 | 手动 | NOT RUN |
| 进入 Connected | 手动 | NOT RUN |
| Disconnect | 手动 | NOT RUN |
| Connect | 手动 | NOT RUN |
| 打开 Launch at login | 手动 | NOT RUN |
| 关闭 Launch at login | 手动 | NOT RUN |
| 凭据恢复 | 手动 | NOT RUN |
| 真实断网后的恢复，且只有一次恢复 | 手动。不要写进 CI | NOT RUN |
| 真实休眠 / 唤醒 | 手动。不要写进 CI | NOT RUN |
| 有意做一次远程锁屏 | 手动。不要写进 CI | NOT RUN |
| 解锁后 Mote 重连或仍然健康 | 手动。不要写进 CI | NOT RUN |
| Quit Mote 去掉托盘并结束进程 | 手动 | NOT RUN |

真实锁屏的单独状态是 `REAL_WINDOWS_LOCK_RELEASE_SMOKE_NOT_RUN`。真实断网和真实休眠没有做。应用图标已经按现有 Mote 画稿嵌进发布出的 `Mote.Windows.exe`，结构状态是 `FINAL_WINDOWS_ICON_READY`。上面的图标外观仍是 NOT RUN，不能从工程配置或资源结构写成通过。
