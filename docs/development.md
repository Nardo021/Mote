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

已完成。仓库布局、文档和部署文件。

## Phase 2 — Mote for Mac

已完成。原生 macOS 应用和 Mote Agent 位于 `macos/`。当前版本 `1.2.0`（build `3`）。

```text
open macos/Mote.xcodeproj
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -destination 'platform=macOS' build
xcodebuild -project macos/Mote.xcodeproj -scheme Mote -destination 'platform=macOS' test
```

见 [macos/README.md](../macos/README.md)。

## Phase 3 — Mote Relay

已完成。后端和 PVE 部署位于 `relay/` 和 `deploy/`。

```text
cd relay
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm start
npm run cli -- device create --name "Development Mac" --id <MAC_DEVICE_ID>
npm run cli -- token create --name "Development Shortcut"
```

本地端点：

```text
http://127.0.0.1:3000
ws://127.0.0.1:3000/v1/ws/device
ws://127.0.0.1:3000/v1/ws/pair
```

生产：

```text
https://relay.yanze.me
wss://relay.yanze.me/v1/ws/device
wss://relay.yanze.me/v1/ws/pair
```

针对本地 Relay 的开发配对：

1. DEBUG 版 Mote for Mac 把 Relay URL 覆盖设为 `http://127.0.0.1:3000`。
2. 点 **Pair**，在本地 Dashboard 批准。
3. 或继续用 CLI 后粘贴凭据：

```text
npm run build
npm run cli -- device create --name "Development Mac" --id <MAC_DEVICE_ID>
npm run cli -- token create --name "Development Shortcut"
```

不要在 Release 中关闭 TLS 检查。

见 [relay/README.md](../relay/README.md) 和 [design.md](../design.md)。

## Dashboard 本地开发

Dashboard 是 Vite SPA，位于 `dashboard/`。UI 使用 shadcn/ui，颜色 token 仍对齐 [design.md](../design.md)。开发时可以和 Relay 分开跑：

```text
# Terminal 1
cd relay
npm run dev

# Terminal 2
cd dashboard
npm install
npm run dev
```

Vite 开发服务器（`http://127.0.0.1:5173`）把 `/admin/api`、`/v1`、`/health` 和 `/ready` 代理到 `http://127.0.0.1:3000`。Cookie 仍然走同一浏览器源。

生产构建：

```text
cd dashboard
npm run typecheck
npm test
npm run build
```

Docker 镜像会把 `dashboard/dist` 拷进 Relay 容器。不要在生产环境跑 Vite。

引导管理员：

```text
cd relay
npm run build
npm run cli -- admin create --username admin
```

无 TTY 时：

```text
printf '%s\n' "$PASSWORD" | npm run cli -- admin create --username admin --password-stdin
```

见 [dashboard/README.md](../dashboard/README.md)。

## Phase 4 — Apple 快捷指令

配置步骤见 [shortcuts.md](shortcuts.md)。用 `send_command` token 和 Device ID 在 iPhone 上建立「获取 URL 内容」快捷指令，再添加到 Siri。接通前先用 curl 打 `POST /v1/devices/:deviceId/commands`。

仓库不附带 `.shortcut` 文件。在 Mote iOS 落地之前，这是 iPhone 的正式触发方式。

## Phase 5 — Mote iOS

下一步。原生 iPhone 应用，走现有 HTTPS 命令 API。

- 付费 Apple Developer + Xcode 直装到自己的手机
- 不上架 App Store，不把 TestFlight 当日常更新
- 同一 Bundle ID 覆盖安装；改 Version / Build 后再 Run
- 不要提交 Team ID
- 活动来源 `ios` 已在 SQLite 预留

约定见 [ios.md](ios.md)。仓库里还没有 `ios/`。

## 之后 — 本地直连

- Bonjour 发现
- 与 Mac 的本地认证连接
- 自动 Relay 回退

不要在 Phase 5 里一并实现。

## macOS 工程

Xcode 工程是 `macos/Mote.xcodeproj`。应用显示名 **Mote**，bundle identifier `me.yanze.mote`，macOS 14+，Swift 6。Team ID 未设置，不要提交。见 [macos/README.md](../macos/README.md)。

## 不要添加的内容

- App Store / TestFlight 作为个人日常分发
- Next / Nuxt / SvelteKit / 单独的 Dashboard 服务器
- Redis、PostgreSQL、ORM
- NestJS、Express
- Kubernetes、微服务、MQTT
- Bonjour、蓝牙或其他本地直连传输代码（尚未到这一阶段）
- 任意 shell 执行
- 分析 / 遥测 SaaS
- 应用源码中的真实密钥、Team ID、局域网 IP 或生产证书（当前生产 LXC 地址只属于基础设施文档）
