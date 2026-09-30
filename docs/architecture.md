# 架构

Mote 是一套轻量的个人远程动作系统。

**Relay** 只是后端组件。产品名是 **Mote**。

Mote for Mac、Mote Relay、Dashboard 和配对已经实现。iPhone 当前用 [shortcuts.md](shortcuts.md) 手建快捷指令。原生 iOS 应用尚未进仓库；个人分发约定见 [ios.md](ios.md)。

## 命名

| 名称                 | 角色                      |
| -------------------- | ------------------------- |
| Mote                 | 产品                      |
| Mote for Mac         | 原生 macOS 应用           |
| Mote for Windows     | 原生 Windows 托盘 Agent   |
| Mote Agent           | Mote for Mac 内的后台组件 |
| Mote Relay           | 后端服务                  |
| Mote Relay Dashboard | 浏览器里的管理界面        |
| Mote iOS             | 计划中的原生 iPhone 应用  |
| `relay.example.com`  | 文档里的示例公网主机名；部署时换成自己的 |
| `mote`               | 仓库名                    |

## 当前架构

唯一支持的生产运行时是 Cloudflare Worker，加上一个名为 `mote` 的 Durable Object。

```text
Internet
    │
    │  HTTPS（Dashboard、快捷指令）
    │  WSS（Mac 或 Windows 主动连出）
    ▼
Cloudflare Worker
    │
    ├── Workers Assets          Dashboard
    │
    └── idFromName("mote")
            │
            ▼
        MoteRelay Durable Object
            ├── Durable Object SQLite
            ├── WebSocket（hibernation）
            ├── 在线连接与配对状态
            └── 内存中的在途命令等待
                    │
                    │  Mac 或 Windows 出站 WSS
                    ▼
                Mote for Mac / Mote for Windows
                    │
                    ▼
                本机锁屏
```

```text
当前:
Apple Shortcut / Dashboard → Mote Relay → Mote Agent → Lock
```

Cloudflare Access 不是 Mote 的认证。Cloudflare Tunnel 不是这套生产架构的一部分。Node、Fastify、本机 SQLite 文件和 Docker 自托管都不再支持。

更早的文档写过 Proxmox VE、Docker 和 Tunnel 源站。那是历史部署，不是当前架构。

### 组件

- **Apple 快捷指令** — 向 `https://relay.example.com` 发送已认证的 HTTPS 请求。在家和外出使用同一主机名。这是当前的 iPhone 触发方式。
- **Mote Relay** — Cloudflare Worker 把 `/health`、`/ready`、`/v1/*`、`/admin/*`、`/s/*` 交给同一个 `MoteRelay` Durable Object。其余路径由 Workers Assets 提供 Dashboard。Relay 认证命令客户端、确认 Mac 在线、生成短生命周期协议命令，并等待 `command_result`。它不执行操作系统命令，也不调用 Cloudflare API。
- **Mote Relay Dashboard** — 浏览器管理界面，由 Workers Assets 托管，不是单独的服务器。页面：Overview、Devices（含配对批准）、Tokens、Activity、Settings。登录后打开 `GET /admin/api/events`（SSE，只推 `devices` / `pairing` / `activity` / `tokens`），再拉现有 REST。
- **Mote Agent** — Mac 菜单栏应用和 Windows 托盘应用里的持久后台组件。维护出站 WebSocket，并执行允许列表中的本地动作。
- **Mote for Mac** — 原生 macOS 应用（菜单栏、生命周期、凭据、Agent 协调）。产品版本 `2.0.0`，构建号 `15`。
- **Mote for Windows** — 原生 Windows 托盘应用。同一台 Relay、Protocol v1，跑在已登录用户会话里，不是 Windows 服务。凭据在 Credential Manager。发行形态是未签名的便携包，还没有进入 GitHub Release。见 [windows/README.md](../windows/README.md)。
- **Mote iOS** — 尚未实现。计划复用同一条 `send_command` HTTPS API，见 [ios.md](ios.md)。

### 动作

当前唯一动作是 `lock`。规范在 [protocol/](../protocol/README.md)。

架构中永不包含任意 shell 命令执行。

### 设备身份

Mote for Mac 在首次启动时生成持久的 `device_id`，并在设置中显示。未配置时主按钮是 **Pair**：Mac 向 Relay 提交配对请求，Dashboard 批准后 Relay 创建设备并把 `device_connection` 凭据推给正在等待的 Mac。凭据轮换在 Dashboard 完成。没有用来改线上数据库的管理 CLI。

### 连接模型

Mac 主动发起出站连接 `wss://<配置的 Relay 主机>/v1/ws/device`。下面示意图里的 `relay.example.com` 只说明路径形状；Mac 没有这份默认主机名，没有 `MOTE_RELAY_URL` 或设置里的有效 URL 时保持未配置。Durable Object 用 WebSocket hibernation 保存这条连接。每台设备同时只有一条活动套接字；更新的已认证连接会取代旧连接。应用层「已连接」的含义是 `auth_result.status == "ok"`。没有额外的 `connected` 帧。

Mac 侧只有 `RelayClient` 持有连接状态。`AgentCoordinator` 表达连接意愿，`AppState` 做界面投影。系统睡眠会停掉心跳和重连，不当成凭据失败；唤醒和网络恢复会在仍希望连接、凭据还在、且不是终止状态时立刻重连一次。`lock` 只锁屏幕，不拆连接。Bundle ID、钥匙串 service 和日志 subsystem 都是 `com.nardo021.mote`。旧的 `com.example.mote` 凭据和偏好会一次性迁过来，失败时不删掉唯一的旧凭据。`device_id` 仍是软件生成的 UUID，不绑定硬件序列号。

```text
MoteRelay Durable Object
├── /admin/api/*          Admin API
├── /admin/api/events     Admin SSE（topic 通知）
├── /v1/*                 Machine API
├── /v1/pair/requests     Public pairing HTTP
├── /v1/ws/device         Device WebSocket
├── /v1/ws/pair           Pairing WebSocket
├── /s/:deviceId          Shortcut setup page
├── /health
└── /ready

Worker Assets
└── /                     Dashboard SPA
```

配对 WebSocket 连上 `/v1/ws/pair` 后，第一帧必须是 `pair_auth`。查询参数里的密钥不会被当成认证。

未认证套接字由 alarm 清扫。认证超时默认 5 秒，清扫间隔默认 15 秒：超时之后的下一次清扫会关闭套接字，关闭不会早于超时。心跳过期同样由这次清扫处理。

命令是短暂的。如果 Mac 离线，Relay 立即返回，不会把锁屏命令存起来以后再送。在途的 HTTP 等待只放在 Durable Object 内存里，不写入 SQLite，也没有队列或重试。Durable Object 被驱逐时，这次等待会丢失，调用方会等到自己的 HTTP 超时。这是当前单人、低规模下接受的限制。

一次 HTTP 请求只尝试一次命令。`command_result` 只能由目标设备的已认证套接字完成；别的设备送来的结果会被忽略。迟到或重复的结果不会再改变已结束的命令。

活动来源（`source`）已写入 SQLite，允许值：

```text
shortcut
dashboard
```

公开命令 API 记为 `shortcut`。Dashboard 发令记为 `dashboard`。历史上的 `ios` 行在迁移 7 里改成 `shortcut`，活动没有删除。设备认证时上报 `platform` 和 `actions`，Relay 按当前连接声明的能力转发 `lock`。

协议仍然是 v1。

### 存储

生产数据库只有 Durable Object SQLite。迁移历史保持原样，不压扁、不重建。领域服务通过 repository 访问数据库，再由 Durable Object SQLite 适配器执行 SQL。

测试用 Node 自带的内存 SQLite，走同一套适配器。这不是生产后端。

### 为什么只有一个 Durable Object

`idFromName("mote")` 把在线连接、SQLite、命令路由和配对放在同一个一致性边界里。当前 Mote 是单操作者、低规模。先不要按设备或用户拆分，也不要再加一个 Durable Object 类。

## 公网 URL

快捷指令以及之后的命令客户端始终使用：

```text
https://relay.example.com
```

Mac 始终使用：

```text
wss://relay.example.com/v1/ws/device
```

未配置的 Mac 配对使用：

```text
https://relay.example.com/v1/pair/requests
wss://relay.example.com/v1/ws/pair
```

`relay.example.com` 是文档示例。生产设置 `MOTE_PUBLIC_URL`。本地 Wrangler 默认是 `http://127.0.0.1:8787`。

见 [deployment.md](deployment.md)。快捷指令 HTTP 形状见 [protocol.md](protocol.md)。管理员 SSE 见 [protocol.md](protocol.md#管理员事件流)。iPhone 操作步骤见 [shortcuts.md](shortcuts.md)。

## 尚未实现：Mote iOS

原生 iOS 应用不在这个仓库里，也不是当前发布工程的一部分。若以后要做，仍走现有 HTTPS 命令 API，不重写 Relay。Protocol v1 的活动来源只有 `shortcut` 和 `dashboard`。

```text
Mote iOS
   │
   ▼
POST /v1/devices/:deviceId/commands
Authorization: Bearer <send_command>
   │
   ▼
relay.example.com
   │
   ▼
Mote Relay
   │
   ▼
Mote Agent
```

个人分发：付费 Apple Developer + Xcode 装到自己的 iPhone，不上架 App Store。见 [ios.md](ios.md)。

## 之后：本地直连

命令对象保持与传输无关，以便以后增加本地直连而不改动作层。

```text
Mote iOS
   │
   ▼
CommandRouter
   │
   ├── LocalTransport
   │      │
   │      ├── Bonjour 发现
   │      └── 与 Mac 的直接认证连接
   │
   └── RelayTransport
          │
          ▼
     relay.example.com
```

```text
之后:
Mote iOS → 可用时走本地直连 → Relay 回退
```

规则：

- 现在不要实现 Bonjour / 本地 TCP。
- 保持 Mote 协议的命令和结果对象与传输无关。
- 保持 Mote Agent 的动作执行与命令到达方式无关。
- 把 Relay 路径当作永久回退传输，而不是临时方案。
- 未来可能用 Bonjour 做本地直连。那是 **Future / not implemented**。

## 不在范围内

- App Store 上架或把 TestFlight 当作个人日常更新通道
- Bonjour / 本地发现（Future / not implemented）
- Split DNS / 家庭直连 HTTPS
- Cloudflare Access 作为登录门槛
- Cloudflare Tunnel 作为生产拓扑
- Node / Fastify / Docker 自托管
- 按设备或用户拆分 Durable Object
- 把在途命令写入 SQLite 或加队列
- 蓝牙
- MQTT
- Kubernetes 或微服务
- 任意 shell、可执行路径或 AppleScript 执行
- 通用远程代码执行后端
- 单独的 Dashboard 服务器
