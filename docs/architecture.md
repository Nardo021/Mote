# 架构

Mote 是一套轻量的 macOS 远程动作系统。

**Relay** 只是后端组件。产品名是 **Mote**。

Mote for Mac（Phase 2）和 Mote Relay（Phase 3）已经实现。Phase 4 的 Apple 快捷指令配置尚未完成，因此 Siri 还没有接通。

## 命名

| 名称 | 角色 |
| --- | --- |
| Mote | 产品 |
| Mote for Mac | 原生 macOS 应用 |
| Mote Agent | Mote for Mac 内的后台组件 |
| Mote Relay | 后端服务 |
| `relay.yanze.me` | 生产环境主主机名 |
| `mote` | 仓库名 |

## V1 架构

V1 没有 iOS 应用。iPhone 使用 Apple 快捷指令和 Siri。

```text
Apple Siri
    │
    ▼
Apple Shortcut
    │
    │ HTTPS POST
    ▼
relay.yanze.me
    │
    ├── 在家:
    │     Split DNS
    │       ↓
    │     本地 PVE LXC
    │
    └── 外出:
          公网 DNS
            ↓
          Cloudflare
            ↓
          Cloudflare Tunnel
            ↓
          PVE LXC
              ↓
          Mote Relay
              │
              │ 持久、已认证的 WebSocket
              ▼
          Mote Agent
              │
              ▼
          macOS 锁屏
```

```text
V1:
Apple Shortcut → Mote Relay → Mote Agent → Lock
```

### V1 组件

- **Apple 快捷指令** — 向 `https://relay.yanze.me` 发送已认证的 HTTPS 请求。在家和外出使用同一主机名。
- **Split DNS（在家）** — 把该主机名解析到本地 PVE/LXC 上的 Caddy 地址。
- **Cloudflare Tunnel（外出）** — 把同一主机名发布到同一 Relay 进程。
- **Mote Relay** — 认证快捷指令、确认 Mac 在线、生成短生命周期协议命令，并等待 `command_result`。它不执行操作系统命令。管理只通过 CLI，没有 Web 后台。
- **Mote Agent** — Mote for Mac 的持久后台组件。维护 WebSocket，并执行允许列表中的本地动作。
- **Mote for Mac** — 原生 macOS 应用（菜单栏、生命周期、凭据、Agent 协调）。

### V1 动作

V1 唯一动作是 `lock`。`sleep`、`mute`、`unmute` 和 `play_pause` 已预留，在实现之前一律拒绝。

架构中永不包含任意 shell 命令执行。

### 设备身份

Mote for Mac 在首次启动时生成持久的 `device_id`，并在设置中显示。Relay 通过 CLI（`device create --id`）登记该 ID。若省略 `--id`，Relay 也可以自己生成 UUID；Phase 2 没有生产界面覆盖 Mac 生成的 ID，因此支持的配对路径是从 Mac 复制。

### 连接模型

Mac 主动发起出站连接 `wss://relay.yanze.me/v1/ws/device`。应用层「已连接」的含义是 `auth_result.status == "ok"`。没有额外的 `connected` 帧。每台设备同时只有一条活动套接字；更新的已认证连接会取代旧连接。

命令是短暂的。如果 Mac 离线，Relay 立即返回，不会把锁屏命令存起来以后再送。

## Split DNS 要求

快捷指令以及之后的命令客户端始终使用：

```text
https://relay.yanze.me
```

家庭与远程的解析不同，URL 不变。

见 [deployment.md](deployment.md)。快捷指令 HTTP 形状见 [protocol.md](protocol.md)。

## V2 架构兼容性

V1 保持 HTTP API 和 Mac 命令协议可用，以便 V2 增加原生 iOS 应用和本地直连传输时不必重写 Mote Relay。

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
     relay.yanze.me
          │
          ▼
       Mote Relay
          │
          ▼
       Mote Agent
```

```text
V2:
Mote iOS → 可用时走本地直连 → Relay 回退
```

规则：

- 本阶段不要实现 V2。
- 保持 Mote 协议的命令和结果对象与传输无关。
- 保持 Mote Agent 的动作执行与命令到达方式无关。
- 把 Relay 路径当作永久回退传输，而不是 V1 临时方案。

## 不在范围内

- iOS 应用
- Bonjour / 本地发现
- 蓝牙
- MQTT
- Kubernetes 或微服务
- 任意 shell、可执行路径或 AppleScript 执行
- 通用远程代码执行后端
- Web 管理界面（V1 管理仅通过 CLI）
