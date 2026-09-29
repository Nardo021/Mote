# 安全政策

Mote 是个人用的远程动作系统。它不是远程 shell。当前唯一动作是 `lock`。

完整威胁模型见 [docs/security.md](docs/security.md)。这里只说明支持范围和报告方式。

## 支持的版本

| 组件 | 支持 |
| --- | --- |
| Mote for Mac | 仓库里的当前版本（`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`）。协议仍是 v1，和应用版本不是同一个数字 |
| Mote Relay | `main` 上的 Cloudflare Worker：一个 `MoteRelay` Durable Object |
| Dashboard | 同一个 Worker 的静态资源 |
| 旧的 Node / Fastify / Docker / Proxmox 自托管 | 不支持 |

没有自动更新。签名过的 macOS 包只应来自带校验和的 GitHub Release。见 [docs/release.md](docs/release.md)。

## 报告漏洞

不要在公开 Issue、Pull Request 或 Discussion 里写：

- 可利用的细节、请求样本或复现到生产环境的步骤
- 管理员密码、设备凭据、Shortcut token、`pair_secret`、会话 cookie
- Cloudflare API token、账号 ID、Apple 证书、私钥、Team ID

本仓库没有公开的安全邮箱。GitHub 仓库 API 没有显示已启用的 Private vulnerability reporting，所以这里不能把它当成已经可用的入口。

维护者应在 GitHub 仓库的 Settings → Code security 里打开 **Private vulnerability reporting**。打开之后，报告走仓库 Security 页的 “Report a vulnerability”。在确认该开关已经打开之前，不要把漏洞细节发到公开 Issue。

## 不要提交的东西

`.env`、`.dev.vars`、证书（`.p12` / `.p8` / `.pem`）、私钥和描述文件都已忽略。`.dev.vars.example` 只有占位符。Wrangler 生成的 `relay/worker-configuration.d.ts` 也不入库。

## 边界

- 动作允许列表。客户端不能提交 shell、可执行路径或 AppleScript。
- 设备凭据 `device_connection` 只认证 Mac 的 WebSocket。Shortcut token `send_command` 只作用于绑定的那一台设备。两者都不能登录 Dashboard。
- 管理员是独立的用户名和密码。首次管理员来自 `MOTE_ADMIN_PASSWORD`，不是管理 CLI。
- 配对在已认证的 WebSocket 上交凭据。Relay 只存哈希。
- Cloudflare 提供计算和 TLS 终结。Cloudflare Access 不是 Mote 的认证。
- Mac 凭据在钥匙串，service 为 `com.nardo021.mote`。旧的 `com.example.mote` 只在一次性迁移里读取。
- 应用沙盒关闭。锁屏使用私有 `login.framework` 符号，失败时才回退到辅助功能下的 Control-Command-Q。这可能影响 Developer ID 公证，见 [docs/release.md](docs/release.md)。不要为了公证关掉 Hardened Runtime，也不要改回任意进程可读的钥匙串 ACL。
