# 开发

本仓库包含已完成的 Mote for Mac（Phase 2）和 Mote Relay（Phase 3）。后续阶段应沿用现有架构。视觉规范见仓库根目录 [design.md](../design.md)。

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

已完成。原生 macOS 应用和 Mote Agent 位于 `macos/`。

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
```

生产：

```text
https://relay.yanze.me
wss://relay.yanze.me/v1/ws/device
```

针对本地 Relay 的开发配对：

```text
npm run build
npm run cli -- device create --name "Development Mac" --id <MAC_DEVICE_ID>
npm run cli -- token create --name "Development Shortcut"
```

在 DEBUG 版 Mote for Mac 中，把 Relay URL 覆盖设为 `http://127.0.0.1:3000`，并把设备凭据保存到钥匙串。不要在 Release 中关闭 TLS 检查。

见 [relay/README.md](../relay/README.md) 和 [design.md](../design.md)。

## Dashboard 本地开发

Dashboard 是 Vite SPA，位于 `dashboard/`。开发时可以和 Relay 分开跑：

```text
# Terminal 1
cd relay
npm run dev

# Terminal 2
cd dashboard
npm install
npm run dev
```

Vite 开发服务器把 `/admin/api`、`/v1`、`/health` 和 `/ready` 代理到 `http://127.0.0.1:3000`。Cookie 仍然走同一浏览器源。

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

## Phase 4 — Apple 快捷指令

配置 Siri + 快捷指令以触发 `lock`。

V1 没有 iOS 应用。

## Phase 5 — V2

- 原生 iOS 应用
- Bonjour 发现
- 本地直连
- 自动 Relay 回退

不要在 V1 工作中实现 Phase 5。

## macOS 工程

Xcode 工程是 `macos/Mote.xcodeproj`。应用显示名 **Mote**，bundle identifier `me.yanze.mote`，macOS 14+，Swift 6。Team ID 未设置。见 [macos/README.md](../macos/README.md)。

## 不要添加的内容

- iOS 应用或任何 iOS target
- Next / Nuxt / SvelteKit / 单独的 Dashboard 服务器
- Redis、PostgreSQL、ORM
- NestJS、Express
- Kubernetes、微服务、MQTT
- Bonjour、蓝牙或其他 V2 传输代码
- 任意 shell 执行
- 分析 / 遥测 SaaS
- 应用源码中的真实密钥、Team ID、局域网 IP 或生产证书（当前生产 LXC 地址只属于基础设施文档）
