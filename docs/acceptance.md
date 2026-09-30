# 跨平台验收

自动化结果和真实设备上的手动结果分开写。单元测试里的假锁屏、假断网和假休眠不是真实设备通过。

| 行为 | macOS | Windows |
| --- | --- | --- |
| 配对 | NOT RUN | PASS |
| 凭据安全存储 | NOT RUN | PASS |
| 认证 | NOT RUN | PASS |
| 心跳 | NOT RUN | PASS |
| 锁屏 | NOT RUN | NOT RUN |
| 断开 | NOT RUN | PASS |
| 重连 | NOT RUN | PASS |
| 网络恢复 | NOT RUN | NOT RUN |
| 睡眠 / 唤醒 | NOT RUN | NOT RUN |
| 登录启动 | NOT RUN | NOT RUN |
| 单用户会话 Agent | NOT RUN | PASS |
| 发行产物 | NOT RUN | PASS |
| 受信任签名 | BLOCKED | BLOCKED |
| 手动发行验收 | NOT RUN | NOT RUN |

Windows 的配对、凭据、认证、心跳、断开和重连来自本地 Wrangler 上的真实 Relay 端到端测试。锁屏命令在那次测试里由替身接收，没有调用 `LockWorkStation()`，所以锁屏一行是 NOT RUN。登录启动有单元测试，发布出的程序没有在桌面上开关过。网络恢复和睡眠唤醒在 Windows 上有单元测试，真实网卡和真实休眠没有做。发行产物是未签名的便携包，构建和冒烟通过；它不是受信任签名的正式包。

Mac 的协议和 safe 测试留在 CI。签名、公证和手动验收没有在这台机器上执行。
