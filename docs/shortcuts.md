# Apple 快捷指令

当前 iPhone（或 iPad）用系统「快捷指令」向 Mote Relay 发一次 HTTPS 请求，触发唯一允许的动作 `lock`。原生 Mote iOS 尚未进仓库；个人分发约定见 [ios.md](ios.md)。仓库不附带可安装的 `.shortcut` 文件；可按本文手建，或在一台 Apple 设备上分享 iCloud 链接后点开添加。

HTTP 形状见 [protocol.md](protocol.md)。凭据角色见 [security.md](security.md)。

```text
Siri / 快捷指令
      │
      │ POST https://relay.yanze.me/v1/devices/:deviceId/commands
      │ Authorization: Bearer <send_command token>
      │ {"action":"lock"}
      ▼
Mote Relay
      │
      │ 已认证 WebSocket
      ▼
Mote Agent → macOS 锁屏
```

## 前置条件

1. Mote Relay 已在生产环境运行，公网为 `https://relay.yanze.me`。
2. Mote for Mac 已配对、菜单栏为 **Connected**，且 **Lock Permission** 为 **Granted**。
3. 你有这台 Mac 的 Device ID。Dashboard 设备详情可以 **Copy Shortcut Link**，打开 `https://relay.yanze.me/s/<DEVICE_ID>`；Mac 的 **Shortcuts** 区也会预填 Device ID 并打开同一页。页面**不会**带上 shortcut token。
4. `relay.yanze.me` 前面没有交互式 Cloudflare Access。快捷指令无法完成浏览器登录。

不要在快捷指令里使用 `http://192.168.2.44:3000`、`http://127.0.0.1:3000` 或任何局域网地址。客户端始终走 `https://relay.yanze.me`。

本地 Relay 用本机 `curl` 验证，不要用手机打开发机回环地址。

## 安装页

每个设备都有公开安装页：

```text
https://relay.yanze.me/s/<DEVICE_ID>
```

页上已填 Device ID 和 `POST /v1/devices/<DEVICE_ID>/commands`。Token 必须在 Dashboard **Tokens** 自己创建后粘贴进快捷指令。可选环境变量 `MOTE_SHORTCUT_ICLOUD_URL` 会在页上增加一条你事先分享的 iCloud 快捷指令链接；Apple 无法通过 URL 预填导入问题。

## 创建快捷指令 token

权限必须是 `send_command`。不要把 Mac 的 `device_connection` 凭据填进快捷指令。

Dashboard（推荐）：

1. 打开 `https://relay.yanze.me/` 并登录管理员。
2. **Tokens** → 名称例如 `Leo iPhone` → **Create Token**。
3. 对话框里的明文只出现这一次。立刻复制，不要截图进相册或聊天。

CLI（生产）：

```text
docker compose exec relay node dist/cli.js token create --name "Leo iPhone"
```

CLI（本地已构建）：

```text
cd relay
npm run cli -- token create --name "Leo iPhone"
```

密钥只打印一次。Relay 只保存 SHA-256 哈希。

## 接通 Siri 前先用 curl 测

把 `<DEVICE_ID>` 和 `<SHORTCUT_TOKEN>` 换成真实值。Windows `cmd` 用 `^` 续行；PowerShell / Unix 用 `\`。

```text
curl ^
  -X POST ^
  "https://relay.yanze.me/v1/devices/<DEVICE_ID>/commands" ^
  -H "Authorization: Bearer <SHORTCUT_TOKEN>" ^
  -H "Content-Type: application/json" ^
  -d "{\"action\":\"lock\"}"
```

Mac 在线且已授予辅助功能时，预期 HTTP 200：

```json
{
  "status": "completed",
  "device_id": "...",
  "device": "MacBook Pro",
  "command_id": "..."
}
```

离线是 HTTP 409、`"status":"offline"`，命令不会排队。curl 失败时先修 Relay / Mac / token，再做手机步骤。

查在线状态：

```text
curl ^
  "https://relay.yanze.me/v1/devices/<DEVICE_ID>/status" ^
  -H "Authorization: Bearer <SHORTCUT_TOKEN>"
```

## 在 iPhone 上建立「锁屏」快捷指令

系统语言为简体中文时，动作名如下。英文界面用括号中的名称。

1. 打开 **快捷指令**（Shortcuts）。
2. 右上角 **+** 新建快捷指令。标题改为 `锁定 Mac`（或你要对 Siri 说的短语的近义名）。
3. **添加操作**，搜索 **获取 URL 内容**（Get Contents of URL）。
   - 不要选 **获取网页内容**（Get Webpage Contents）。那是抓 HTML，不是发 JSON。
4. URL：

   ```text
   https://relay.yanze.me/v1/devices/<DEVICE_ID>/commands
   ```

   把 `<DEVICE_ID>` 换成完整 UUID，不要用设置里的缩写。

5. 展开该动作（**显示更多** / Show More）：
   - **方法**（Method）：`POST`
   - **标头**（Headers）增加两行（值里的空格必须保留）：
     - `Authorization` → `Bearer <SHORTCUT_TOKEN>`
     - `Content-Type` → `application/json`
   - **请求体**（Request Body）：`JSON`
   - 添加字段 `action`，文本值 `lock`
6. 不要添加 `id`、`created_at`、`expires_at`、`nonce`。这些由 Relay 生成。
7. 不要把 token 放进 URL 查询串、路径或快捷指令名称。
8. 可选：在「获取 URL 内容」之后添加 **获取词典的值**（Get Dictionary Value），键为 `status`，再 **显示通知**（Show Notification）或 **显示结果**（Show Result）。Siri 触发时通知比整页结果更干净。
9. 右上角 **信息**（ⓘ）→ **添加到 Siri**。短语例如「锁定电脑」或「锁屏」。避免过于短、容易误触的单字。
10. 首次运行时，iOS 会询问是否允许访问 `relay.yanze.me`。允许。之后可在快捷指令隐私设置里改成始终允许。

运行后这台已连接的 Mac 应立即进入锁屏。Relay 默认最多等约 12 秒；Siri 会一直等到响应返回。

### 可选：查询状态

再建一条快捷指令，动作为同一个 **获取 URL 内容**：

- URL：`https://relay.yanze.me/v1/devices/<DEVICE_ID>/status`
- 方法：`GET`
- 标头：只要 `Authorization: Bearer <SHORTCUT_TOKEN>`
- 无请求体

用 **获取词典的值** 读取 `online` / `name`，再通知自己。这条不能锁屏。

## 通过链接安装

Apple **不允许**点开链接后在后台静默装好。能做到的是：打开一个 iCloud 链接 → 系统弹出预览 → 用户点 **添加快捷指令**。这是官方分发方式。

可安装链接长这样：

```text
https://www.icloud.com/shortcuts/<分享 ID>
```

只有「快捷指令」App 能生成这个链接。Windows、GitHub、Dashboard、Relay 都发不出可被 iOS 信任的安装包。把自签 `.shortcut` 挂到仓库或 Gist，再用 `shortcuts://import-shortcut?url=…`，现在通常会失败；导入通道基本上只认 `icloud.com/shortcuts/…`。

### 自己发一条（只需一台 iPhone / iPad / Mac 做一次）

1. 按上一节建好「锁定 Mac」，但 **不要把真实 Device ID 或 token 写进模板**。
2. URL 用「文本」或「URL」动作拼出来，Device ID 做成可替换字段；`Authorization` 同样引用 token 字段。
3. 分享前打开快捷指令 **信息** → **导入问题**（Import Questions）：
   - Device ID：提示「Mote Device ID（完整 UUID）」
   - Token：提示「Shortcut token（只要密钥，不要写 Bearer）」
4. 分享 → **拷贝 iCloud 链接**（Copy iCloud Link）。
5. 把该 URL 发给自己或写进私人笔记。不要把填好密钥的成品快捷指令拿去分享。
6. 在目标 iPhone 上打开链接 → **添加快捷指令** → 填入 Device ID 和 token。快捷指令里应写成 `Bearer ` + 导入的 token。
7. 再 **添加到 Siri**。导入不会自动登记 Siri 短语。

导入问题只在「添加」时问一次，之后运行不再问。token 仍会留在这台设备的快捷指令里。

### 做不到的事

- 仓库里放一个链接，让任何人点一下就装好且已带上你的 token（也不应该这样做）。
- 从 Windows / CI 生成可安装快捷指令并跳过 Apple 签名。
- 无确认、无预览的静默安装。
- `shortcuts://run-shortcut?name=…` 只能运行**已经装过**的快捷指令，不能用来安装。

停用链接：用当初分享的那台设备打开该 iCloud 链接，在快捷指令里停止分享。已经添加过的副本还在对方手机上，需要的话同时 `token rotate`。

## 结果怎么读

命令接口在有意义时带顶层 `status`。锁屏快捷指令可以只看这个字段：

| `status`                                         | HTTP | 含义                                    |
| ------------------------------------------------ | ---- | --------------------------------------- |
| `completed`                                      | 200  | Mac 已锁屏                              |
| `permission_required`                            | 200  | Mac 在线，但辅助功能未授权              |
| `failed` / `expired` / `invalid` / `unsupported` | 200  | 命令未执行；看 Mac 或 Relay 活动日志    |
| `offline`                                        | 409  | Mac 未连接；不排队                      |
| `disabled`                                       | 409  | 设备已在 Relay 禁用                     |
| `timeout`                                        | 504  | Relay 在截止前没收到 `command_result`   |
| `rate_limited`                                   | 429  | 该 token 提交过快（默认 10 秒内 10 次） |

`401` 是 token 缺失或无效。`403` 是用了非 `send_command` 凭据（例如误用设备密钥）。`404` 是 Device ID 写错。

## 安全

- Token 存在快捷指令动作里。若开启了快捷指令 iCloud 同步，明文会进 Apple 账号。这是个人工具可接受的折中；不要把这条快捷指令分享到图库或发给别人。
- 轮换：Dashboard 或 `token rotate`。旧值立刻失效，快捷指令标头必须改成新值。
- 丢失或更换手机：`token disable` 或轮换，再在新手机上重建。
- 不要把 token 提交进 Git、截进 README，或写进快捷指令的注释文本。

## 故障排除

| 现象                       | 先查                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Siri 说完成了但 Mac 没锁   | curl 是否已是 `completed`；Mac 辅助功能；是否锁的是另一台已登记设备                    |
| 快捷指令报不允许访问网络   | 首次权限；聚焦模式 / 屏幕使用时间是否限制快捷指令                                      |
| `offline`                  | 菜单栏是否 Connected；合盖睡眠后等重连                                                 |
| `permission_required`      | Mac 设置 → 隐私与安全性 → 辅助功能 → 允许 Mote                                         |
| `401` / `403`              | Bearer 少了 `Bearer ` 前缀或空格；用了设备凭据                                         |
| 一直转到 Cloudflare 登录页 | 去掉该主机名上的交互式 Access                                                          |
| 能 curl 不能快捷指令       | URL 是否少了 `https://`；是否误用「获取网页内容」；请求体是否真的是 JSON `action=lock` |

不要为了「方便」把生产快捷指令改成打局域网 IP。
