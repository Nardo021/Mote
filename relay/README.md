# Mote Relay

**Mote** 的已认证命令中继。Apple 快捷指令通过 HTTPS 发送 `lock`。Mote for Mac 保持一条持久 WebSocket，并在本地执行该允许列表动作。

该进程从不运行 shell 命令、AppleScript 或 SSH。

## 技术栈

- Node.js 22+
- TypeScript（strict、ESM）
- Fastify + `@fastify/websocket` + `@fastify/static` + `@fastify/cookie`
- Dashboard：React + TypeScript + Vite（构建后由本进程静态托管）
- 通过 `better-sqlite3` 使用 SQLite

## 开发

```text
cd relay
npm install
npm run dev
```

默认本地端点：

```text
http://127.0.0.1:3000            Dashboard（需先构建 dashboard，或另开 Vite）
http://127.0.0.1:3000/admin/api  Admin API
ws://127.0.0.1:3000/v1/ws/device
```

本地同时开发 Dashboard：

```text
cd ../dashboard
npm install
npm run dev
```

若要用文件配置，把 `.env.example` 复制为 `.env`。已有环境变量优先。

其他脚本：

```text
npm run typecheck
npm test
npm run build
npm start
npm run cli -- device list
```

`npm run cli` 需要先 `npm run build`。未构建时用 `npm run cli:dev -- ...`。

## 引导

Mote for Mac 自己生成持久的 `device_id` 并在设置中显示。先登记该 ID，再把 Relay 签发的设备凭据存入 Mac 钥匙串。

```text
npm run build
npm run cli -- device create --name "Development Mac" --id <MAC_DEVICE_ID>
npm run cli -- token create --name "Development Shortcut"
npm run cli -- admin create --username admin
```

若省略 `--id`，Relay 会生成 UUID。Phase 2 的 Mote for Mac 无法设置这个生成的 ID，因此支持的 V1 配对路径是：从 Mac 复制 Device ID，再传入 `--id`。

密钥只打印一次。服务端只保存 SHA-256 哈希。

```text
npm run cli -- device list
npm run cli -- device disable <device-id>
npm run cli -- device rotate <device-id>
npm run cli -- token list
npm run cli -- token disable <token-id>
npm run cli -- token rotate <token-id>
```

未构建时，可用 `npm run cli:dev -- ...` 通过 `tsx` 运行同一套 CLI。

## 生产 CLI

```text
docker compose exec relay node dist/cli.js device create --name "MacBook Pro" --id <MAC_DEVICE_ID>
docker compose exec relay node dist/cli.js token create --name "Leo iPhone"
docker compose exec -it relay node dist/cli.js admin create --username admin
```

## HTTP API

快捷指令客户端使用 `Authorization: Bearer <token>`，权限为 `send_command`。

| 方法   | 路径                             | 认证         | 用途                                  |
| ------ | -------------------------------- | ------------ | ------------------------------------- |
| `POST` | `/v1/devices/:deviceId/commands` | Bearer       | 发送 `{"action":"lock"}`              |
| `GET`  | `/v1/devices/:deviceId/status`   | Bearer       | 在线 / 最近见到                       |
| `GET`  | `/v1/ws/device`                  | 设备 WS 认证 | Mote Agent 套接字（升级为 WebSocket） |
| `GET`  | `/`                              | 无           | Dashboard SPA                         |
| `*`    | `/admin/api/*`                   | 管理员会话   | Dashboard 管理 API                    |
| `GET`  | `/health`                        | 无           | 进程存活                              |
| `GET`  | `/ready`                         | 无           | 数据库 + 进程就绪；失败时 `503`       |

健康检查不要求 Mac 在线。完整状态码见 [docs/protocol.md](../docs/protocol.md)。

## 命令语义

- 离线设备返回 `409`，带 `"status":"offline"`。命令不会排队。
- 已禁用设备返回 `409`，带 `"status":"disabled"`。
- Mac 的 `command_result` 返回 `200`，并使用扁平的 `status` 字段（`completed`、`permission_required` 等）。
- 截止时间前没有确认则返回 `504`，带 `"status":"timeout"`（默认等待 12 秒；命令 TTL 默认 10 秒）。
- 不支持的动作返回 `422`。
- 命令提交默认每 token 每 10 秒最多 10 次，超出返回 `429`。
- 命令元数据（`id`、`created_at`、`expires_at`、`nonce`）由 Relay 生成，不是快捷指令生成。
- `last_seen_at` 写入 SQLite 会节流（默认约 60 秒，或断开时落盘）。心跳本身不每次写库。

## 布局

```text
src/
  index.ts           进程入口
  cli.ts             凭据与管理员管理
  app.ts             Fastify 应用
  config/            环境与常量
  api/               HTTP 路由与 Dashboard 静态托管
  admin/             管理员账户、会话、管理 API
  activity/          命令活动日志
  websocket/         设备套接字与注册表
  auth/              按角色分离的凭据检查
  devices/           SQLite 设备与 token 存储
  commands/          路由、pending 映射、校验
  protocol/          Mote Protocol v1 编解码
  storage/           SQLite 打开与迁移
  utils/             ID、错误、速率限制
test/                单元测试与模拟集成测试
data/                本地 SQLite 目录（内容已 gitignore）
Dockerfile           多阶段生产镜像（含 Dashboard，非 root）
```
