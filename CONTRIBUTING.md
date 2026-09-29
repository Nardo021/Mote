# 参与贡献

Mote 的架构已经固定：一个 Cloudflare Worker、一个 `MoteRelay` Durable Object、Durable Object SQLite、Protocol v1、设备范围的 Shortcut token，以及主动连出的 Mac。改协议或再加一套运行时之前，先打开 Issue 讨论。

Bundle ID 保持 `com.nardo021.mote`。`com.example.mote` 只用于一次性迁移。

## 环境

- Node.js 22 或更新
- 仓库根、`relay/`、`dashboard/` 各自有 lockfile
- macOS 应用需要 macOS 14+ 和 Xcode 26.1（工程 `LastUpgradeCheck` 为 2610）
- 不需要生产 Cloudflare 账号也能跑测试和 Worker 干跑

```text
npm ci
npm ci --prefix relay
npm ci --prefix dashboard
cp .dev.vars.example .dev.vars
```

`.dev.vars` 只放本地管理员密码。不要提交它，也不要提交证书、token 或 Team ID。

本地 Worker：

```text
npm run dev:worker
```

Dashboard 热更新是另一条进程：`npm run dev --prefix dashboard`（`5173`，API 代理到 `8787`）。

Mac 的 Relay URL 填 `http://127.0.0.1:8787`，或设置 `MOTE_RELAY_URL`。没有 URL 时保持未配置，不会去连文档里的示例主机名。

## 检查

```text
npm test
npm run typecheck
npm run build
npm run worker:dry-run
npm run ci
```

`npm test` 包含 Relay、协议夹具、Dashboard，以及 `scripts/check-repository.mjs`。`npm run typecheck` 会先用 Wrangler 生成 `relay/worker-configuration.d.ts`。这个文件不入库。`npm run build` 不部署。`npm run ci` 是上述 Node 检查的一条命令。

macOS 不进 npm：

```text
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -configuration Debug -destination 'platform=macOS' build
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -testPlan Mote-Safe -destination 'platform=macOS' test
```

## 安全测试和副作用测试

Scheme `Mote` 的默认计划是 `Mote-Safe`。它跳过 `LockActionLiveTests`，并把 `MOTE_RUN_SIDE_EFFECT_TESTS` 设为 `0`。

`LockActionTests` 只注入闭包，可以留在安全计划里。`LockActionLiveTests` 在显式打开环境变量时解析私有锁屏符号，但不调用它。CI 不会设置 `MOTE_RUN_SIDE_EFFECT_TESTS=1`。

真实锁屏是本机 DEBUG 的 **Test Lock**，不是 XCTest。钥匙串测试使用 `com.nardo021.mote.test.<uuid>`，不碰生产 service。

## 协议

Protocol v1 的目录、schema 和夹具在 `protocol/`。改线上字段时要同时改 Relay、Mac 和夹具测试。不要把应用的 `MARKETING_VERSION` 当成协议版本。

## Pull request

GitHub Actions 的 CI 会跑 Relay、Dashboard、Worker 干跑、macOS 安全测试和仓库一致性检查。CI 不部署。

推送到 `main` 且 CI 成功之后，才会考虑 Cloudflare 部署。没有 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 时，部署任务会跳过，并且不会打印密钥。
