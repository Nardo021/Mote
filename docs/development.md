# 开发

本仓库包含已完成的 Mote for Mac、Mote Relay、Dashboard 和配对。后续阶段应沿用现有架构。视觉规范见仓库根目录 [design.md](../design.md)。iOS 个人分发约定见 [ios.md](ios.md)。

## 代码质量

- 命名清晰
- 文件保持小
- TypeScript 使用 strict；除非绝对必要，不要用 `any`
- 不要过早抽象
- 只在有用处写注释
- Unix LF、UTF-8
- JSON、YAML 和 TypeScript 使用 2 空格缩进
- 遵循常规 Swift 格式约定

## 路线图

## Phase 1 — 仓库基础

已完成。仓库布局和文档。

## Phase 2 — Mote for Mac

已完成。原生 macOS 应用和 Mote Agent 位于 `macos/`。当前版本 `1.5.6`（build `14`）。

```text
open macos/Mote.xcodeproj
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -destination 'platform=macOS' build
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -testPlan Mote-Safe -destination 'platform=macOS' test
```

见 [macos/README.md](../macos/README.md)。默认测试计划 `Mote-Safe` 不会锁屏。真实锁屏只在本机 DEBUG **Test Lock**。

## Windows Agent（W5）

`windows/` 是 .NET 10 WPF 托盘程序。需要 .NET 10 SDK。核心运行时可以配对并维持已认证会话。网络中断和系统休眠会作废当前连接代次，恢复后按同一套规则重连。设置窗口可以配对、连接和断开；关掉窗口不会退出。测试不会锁屏，不会改本机网络或让系统休眠，也不会写入当前用户真正的 `Mote` 登录启动项。

```text
cd windows
dotnet restore
dotnet build
dotnet test
```

测试读取仓库里的 `protocol/fixtures/`，不复制夹具。单元测试不调用锁屏 API，也不写当前用户的启动项。CI 在 GitHub 托管的 `windows-latest` 上跑同样的 restore、build、test。说明见 [windows/README.md](../windows/README.md)。

真实 Relay 端到端不在 `dotnet test` 里面。先在仓库根准备 Wrangler 和 Dashboard 资源，再单独跑集成项目：

```text
npm ci
npm ci --prefix relay
npm run build --prefix dashboard
dotnet test windows/tests/Mote.Windows.IntegrationTests/Mote.Windows.IntegrationTests.csproj
```

集成测试只连接 `127.0.0.1` 上的临时 Wrangler，不部署，也不使用生产凭据。

## Relay 本地开发

Relay 没有本地 Node 服务器。本地运行时就是 Wrangler。

```text
# 仓库根。先构建 Dashboard，再在 http://127.0.0.1:8787 启动 Worker
npm run dev:worker
```

复制 `.dev.vars.example` 为 `.dev.vars`，填一个至少 12 位的 `MOTE_ADMIN_PASSWORD`。Worker 在还没有管理员时会用它创建 `admin`。

Mac 的 Relay URL 填 `http://127.0.0.1:8787`，然后 Pair。Dashboard 就在同一个地址。

检查：

```text
cd relay
npm test
npm run typecheck
```

仓库根还可以：

```text
npm test               # Relay、Dashboard、仓库一致性
npm run typecheck      # 先生成 Worker 类型，再检查 Relay 与 Dashboard
npm run build          # Dashboard 生产构建，并安装 Relay 依赖。不部署
npm run worker:dry-run # wrangler deploy --dry-run，不上传
npm run ci             # 上面几项串起来
npm run cf-typegen     # 只生成 relay/worker-configuration.d.ts
```

`relay/worker-configuration.d.ts` 不入库。干净检出靠 `npm run typecheck` 或 `npm run cf-typegen` 重新生成。不要在日常检查里执行不带 `--dry-run` 的 `wrangler deploy`。

## Dashboard 本地开发

改界面时可以让 Vite 热更新，API 仍打到 Wrangler：

```text
# Terminal 1
npm run dev:worker

# Terminal 2
cd dashboard
npm run dev
```

Vite 在 `http://127.0.0.1:5173`，并把 `/admin/api`、`/v1`、`/health`、`/ready` 代理到 `http://127.0.0.1:8787`。`/admin/api` 代理的 `timeout` / `proxyTimeout` 为 0，以免掐断 Dashboard SSE。Cookie 仍然走 Vite 的源。

```text
cd dashboard
npm run typecheck
npm test
npm run build
```

生产环境由 Workers Assets 提供 `dashboard/dist`。不要在生产环境跑 Vite。

见 [dashboard/README.md](../dashboard/README.md) 和 [relay/README.md](../relay/README.md)。

## Phase 4 — Apple 快捷指令

配置步骤见 [shortcuts.md](shortcuts.md)。用 `send_command` token 和 Device ID 在 iPhone 上建立「获取 URL 内容」快捷指令，再添加到 Siri。接通前先用 curl 打 `POST /v1/devices/:deviceId/commands`。

仓库不附带 `.shortcut` 文件。在 Mote iOS 落地之前，这是 iPhone 的正式触发方式。

## 验证

Node.js 22 或更新。三个 lockfile 都要装：

```text
npm ci
npm ci --prefix relay
npm ci --prefix dashboard
npm test
npm run typecheck
npm run build
npm run worker:dry-run
```

`npm run ci` 把 Relay、协议、Dashboard 和 Worker 干跑串成一条命令。macOS 仍用 `xcodebuild`。Windows 用上面的 `dotnet test`。发布和签名见 [release.md](release.md)。

## macOS 测试

Xcode 工程是 `macos/Mote.xcodeproj`。Scheme 是 `Mote`。应用显示名 **Mote**，Bundle ID 是 `com.nardo021.mote`（钥匙串 service 和 OSLog subsystem 相同），macOS 14+，Swift 6。Team ID 不入库。沙盒关闭，Hardened Runtime 打开。见 [macos/README.md](../macos/README.md)。

默认测试计划 `Mote-Safe` 编译全部 XCTest，并跳过 `LockActionLiveTests`。`LockActionTests` 只注入闭包，不会锁屏。副作用计划 `Mote-SideEffect` 只包含那个跳过的类；类内部还要求 `MOTE_RUN_SIDE_EFFECT_TESTS=1`，而且不调用锁屏函数。

```text
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -testPlan Mote-Safe -destination 'platform=macOS' test
```

真实钥匙串用例使用 `com.nardo021.mote.test.<uuid>`，不读写生产 service。ACL 查询若被运行环境拒绝，对应用例会跳过，不能把跳过写成 ACL 已通过。在 Windows 上这些测试无法执行，不能把未运行当成已通过。

## 尚未实现

原生 iOS 应用不在仓库里。Protocol v1 的活动来源仍是 `shortcut` 和 `dashboard`。个人约定见 [ios.md](ios.md)。

本地直连（Bonjour、局域网）未实现。自动更新未实现，见 [release.md](release.md)。

## 不要添加的内容

- App Store / TestFlight 作为个人日常分发
- 第二套 Relay 运行时（Node、Fastify、Express、Hono、Koa、NestJS）
- Next / Nuxt / SvelteKit / 单独的 Dashboard 服务器
- Redis、PostgreSQL、ORM
- Kubernetes、微服务、MQTT
- Bonjour、蓝牙或其他本地直连传输代码（尚未到这一阶段）
- 任意 shell 执行
- 分析 / 遥测 SaaS
- 应用源码中的真实密钥、Team ID 或生产证书
