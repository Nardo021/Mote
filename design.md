# Mote 设计语言

Mote for Mac 已按紧凑的原生分组表单落地。下列窗口尺寸、菜单结构和状态文案以当前代码为准；颜色与原则仍是实现时应遵守的规范。下一步的个人 iOS 客户端应沿用同一套 token 与语气，而不是另起一套消费级视觉。

## 1. 设计方向

Mote 应像原生 macOS 工具，而不是消费级生活方式应用。

视觉语言应传达：

- 安静的自信
- 低延迟
- 系统级可靠
- 精确
- 极简
- 技术清晰
- 与 Apple 平台原生融合

Mote 不应看起来好玩、未来感、霓虹、赛博朋克或过度品牌化。

产品在视觉上应介于：

- macOS 系统设置
- Raycast
- Linear
- Tailscale
- Apple 菜单栏工具

界面应足够轻，可以整天停在菜单栏里，而不抢注意力。

## 2. 核心原则

### 原生优先

尽可能使用标准 SwiftUI 组件。

优先：

- 系统材质
- 原生开关
- 原生菜单
- 标准工具栏布局
- SF Symbols
- 平台标准间距
- 语义化系统颜色

除非有明确的 UX 理由，不要重做 macOS 控件。

### 信息先于装饰

每个可见元素都应传达以下之一：

- 连接状态
- 设备身份
- Relay 状态
- 动作可用性
- 权限状态
- 配置

避免装饰插画、渐变、过大的英雄区和工具界面里的营销卡片。

### 平静的状态

Connected 应感觉正常，而不是庆祝。

Disconnected 应能被注意到，但不要看起来像灾难。

错误应说明出了什么问题，以及需要采取什么动作。

### 快速的视觉层级

用户应在一秒内理解：

1. Mote 是否已连接？
2. 这是哪台 Mac？
3. 远程控制是否可用？
4. 是否有事情需要处理？

## 3. 品牌个性

Mote 应感觉：

- 紧凑
- 精确
- 可靠
- 克制
- 偏技术
- 精致

Mote 不应感觉：

- 游戏向
- 黑客主题
- 企业套件
- 幼稚
- 过度未来感
- 动画很多
- 视觉嘈杂

## 4. 产品标记

Mote logo 应极其简单。

建议方向：

- 抽象的信号 / 中继标记
- 一个紧凑的几何符号
- 在 16 × 16 px 下可用
- 可作为菜单栏图标阅读
- 兼容单色
- 不要精细插画
- 图标内不要文字

图标应能用于：

- macOS 菜单栏
- 应用图标
- 设置侧边栏
- 状态界面
- 文档

不要只靠颜色来识别。

## 5. 颜色系统

Mote 应使用克制的中性色板，加一个冷色强调色。

主强调色：

```text
Mote Blue
#4F7CFF
RGB 79, 124, 255
```

它应是主要品牌强调色，用于：

- 选中控件
- 活动连接指示
- 主按钮
- 链接
- 焦点状态
- 品牌高亮

不要把 Mote Blue 当作大面积背景填充。

## 6. 浅色模式色板

### 背景

```text
Canvas
#F7F8FA
```

在需要自定义表面时，用作主应用背景。

合适时优先使用原生 macOS 窗口材质。

### 主表面

```text
Surface
#FFFFFF
```

用于：

- 卡片
- 分组设置
- 弹出层
- 内容面板

### 次表面

```text
Surface Secondary
#F1F3F6
```

用于：

- 次级容器
- 内嵌区域
- 只读字段
- 轻微分组

### 边框

```text
Border
#E1E4E8
```

### 强调边框

```text
Border Strong
#CDD2D9
```

### 主文本

```text
Text Primary
#17191C
```

### 次文本

```text
Text Secondary
#626871
```

### 三级文本

```text
Text Tertiary
#9097A1
```

### 强调色

```text
Accent
#4F7CFF
```

### 强调色悬停

```text
Accent Hover
#416DEB
```

### 柔和强调色

```text
Accent Soft
#E9EFFF
```

## 7. 深色模式色板

深色模式不应是纯黑。

### 背景

```text
Canvas
#101114
```

### 主表面

```text
Surface
#17191D
```

### 次表面

```text
Surface Secondary
#1E2126
```

### 抬升表面

```text
Surface Elevated
#25282E
```

### 边框

```text
Border
#2C3037
```

### 强调边框

```text
Border Strong
#3A3F48
```

### 主文本

```text
Text Primary
#F4F5F7
```

### 次文本

```text
Text Secondary
#A8ADB5
```

### 三级文本

```text
Text Tertiary
#737A84
```

### 强调色

```text
Accent
#6B91FF
```

### 强调色悬停

```text
Accent Hover
#7FA0FF
```

### 柔和强调色

```text
Accent Soft
#1E2B52
```

## 8. 语义色

语义色主要用于传达状态，而不是品牌。

### 已连接 / 成功

浅色：

```text
#2F9E63
```

深色：

```text
#49C47D
```

用于：

- 已连接指示
- 权限已授予
- 成功的命令结果

不要用绿色填充大面积。

### 警告

浅色：

```text
#C88719
```

深色：

```text
#E7A83A
```

用于：

- 重连中
- 降级状态
- 配置需要注意

### 错误

浅色：

```text
#D54848
```

深色：

```text
#F06A6A
```

用于：

- 认证失败
- 必需权限失败
- Relay 不可达
- 配置无效

### 离线 / 中性

浅色：

```text
#8A9099
```

深色：

```text
#777E88
```

用于：

- 已断开状态
- 设备不可用
- 未激活的功能

## 9. 连接状态语言

使用一致的视觉处理。

当前实现标题（与 `ConnectionState` 一致）：

```text
● Connected
◌ Connecting…
◌ Authenticating…
◌ Reconnecting…
○ Disconnected
○ Not Configured
◌ Waiting for Approval…
● Connection Error
```

已连接指示：

- 绿色
- 小
- 静态
- 不要脉冲动画

Connecting / Authenticating / Pairing 使用中性色或 Mote Blue，合适时用轻微的 ProgressView。

仅在重连持续时使用警告色。

Disconnected / Not Configured 使用中性灰。不要在未配置时假装 `Disconnected`。

Connection Error 用红色。红色只用于真正需要处理的失败。菜单栏图标是自定义中继标记加状态圆点，不是单独的锁形 SF Symbol。

## 10. 字体

使用 Apple 系统字体。

主字体：

```text
SF Pro
```

代码 / 技术标识：

```text
SF Mono
```

不要打包自定义字体。

### 建议层级

#### 窗口标题

```text
20–22 pt
Semibold
```

#### 分区标题

```text
13–14 pt
Semibold
```

#### 主标签

```text
13 pt
Regular / Medium
```

#### 次文本

```text
12 pt
Regular
```

#### 元数据

```text
11 pt
Regular
```

#### 技术标识

```text
11–12 pt
SF Mono
```

例如：

- Device ID
- Relay 端点
- 延迟
- 协议信息
- 调试信息

避免过多字号变化。

## 11. 间距系统

使用 8 点为基数的间距系统。

建议取值：

```text
4 px   微间距
8 px   紧间距
12 px  相关控件间距
16 px  默认组件间距
20 px  分区间距
24 px  主要分区间距
32 px  大间隔
```

除非原生组件度量需要，避免 13、17、19、27 这类任意值。

## 12. 圆角

圆角保持克制。

```text
6 px   小控件
8 px   紧凑卡片
10 px  主分组表面
12 px  通用圆角上限
```

不要使用过大的 20–30 px 圆角卡片。

Mote 不应看起来像被拉伸到 macOS 上的 iOS 应用。

## 13. 边框与阴影

优先用边框和原生材质分隔，而不是厚重阴影。

### 边框

使用 1 px 的轻微边框。

### 阴影

仅用于浮动/抬升元素，例如：

- 弹出层
- 菜单
- 临时浮动面板

不要给每个设置卡片都加阴影。

## 14. 主窗口

当前实现宽度：

```text
最小 460 px
理想 520 px
内容最大 520 px
```

高度约 `480–560` px，由分组表单内容决定。主窗口应紧凑，并按纵向组织。

当前层级：

```text
MacBook Pro
● Connected
Relay · 4 ms

Connection
Relay                 relay.yanze.me
Latency               4 ms
Disconnect

Remote Actions
Lock                  Available

Permissions
Lock Permission       Granted

Startup
Start Mote at Login   [ON]

Device
Name                  MacBook Pro
Device ID             7B0F…
Version               1.5.1 (9)
```

`Lock` 为 `Available` 或 `Unavailable`。`Lock Permission` 为 `Granted` 或 `Required`。未配置时不显示 Connection / Remote Actions / Shortcuts，只显示 Pair 空状态。

使用分组分区，而不是仪表盘卡片。

## 15. 主状态头

不要做巨大的状态卡片。当前实现把头做成：

```text
MacBook Pro
● Connected
Relay · 4 ms
```

未连接或出错时不显示传输行。设备名仍应是最容易扫到的身份信息。连接信息（Relay、Latency）是次要的。

## 16. 菜单栏设计

菜单栏是 Mote 日常的主界面。

菜单栏图标应：

- 单色可用
- 遵循 macOS template image 行为
- 在小尺寸下仍可读
- 避免文字

当前菜单布局：

```text
Mote

● Connected
MacBook Pro
Relay
relay.yanze.me · 4 ms
Lock Permission
Granted
Start at Login

──────────────

Open Mote
Disconnect

──────────────

Quit Mote
```

菜单栏图标是自定义中继/信号标记，右下角用状态圆点。不要改回锁形 SF Symbol，也不要把图标做成 template-only 以致状态色消失。

未配置时：

```text
Mote is not configured
MacBook Pro
```

配对中：

```text
◌ Waiting for Approval…
MacBook Pro
```

断开时：

```text
○ Disconnected
MacBook Pro

Reconnect
```

不要把诊断信息堆进菜单。

进阶信息属于主窗口。

## 17. 按钮

### 主按钮

用于需要明确用户意图的动作。

例如：

- Connect
- Grant Permission
- Save

样式：

- Mote Blue
- 标准 macOS 尺寸
- 短标签

### 次按钮

例如：

- Open System Settings
- Copy Device ID
- Disconnect

使用原生 bordered 或 plain 按钮样式。

### 破坏性按钮

例如：

- Remove Credential
- Reset Device

仅在动作确实具有破坏性时使用红色。

## 18. 开关

使用标准 SwiftUI/macOS 开关。

例如：

```text
Start Mote at Login      [ON]
```

Remote Actions 不是开关。当前是只读行：`Lock` → `Available` / `Unavailable`。

不要做移动端那种过大的开关行。

标签应能说明设置做什么，而不需要 tooltip。

## 19. 权限状态

权限必须明确。

好的写法：

```text
Lock Permission
Granted
```

或：

```text
Lock Permission
Required

Mote needs Accessibility permission to lock this Mac remotely.

[Open System Settings]
```

避免笼统的：

```text
Permission error
```

要准确告诉用户缺了什么。

## 20. Relay 信息

显示：

```text
Relay
relay.yanze.me
```

可选的次级元数据：

```text
Connected · 4 ms
```

不要突出显示：

- WebSocket URL
- 端口
- 认证方式
- 原始凭据

这些属于 Debug / Advanced。

## 21. Advanced / Developer 区

Debug 构建可以暴露：

```text
Advanced

Relay Endpoint
wss://relay.yanze.me/v1/ws/device

Device ID
7B0F...

Connection State
authenticated

Protocol
Mote Protocol v1

Last Command
cmd_...

Test Lock

Disconnect

Set Development Credential
```

协议和标识值使用 SF Mono。

这一区应看起来实用，而不是像主界面那样精致。

## 22. 图标

使用 SF Symbols。

建议符号：

```text
Lock
lock.fill

Connected
circle.fill

Disconnected
circle

Relay / Network
network

Latency
gauge.with.dots.needle.33percent

Device
laptopcomputer

Settings
gearshape

Permission
checkmark.shield

Warning
exclamationmark.triangle

Retry
arrow.clockwise

Start at Login
power

Copy
doc.on.doc
```

不要把第三方图标集和 SF Symbols 混用。

## 23. 动效

动效应尽量少。

允许：

- 标准 SwiftUI 过渡
- 连接中的 ProgressView
- 轻微的出现/消失
- 标准悬停效果

避免：

- 已连接指示的脉冲
- 弹跳图标
- 大幅度缩放动画
- 动画渐变
- 装饰性加载序列

Mote 是基础设施软件。动效应解释状态变化，而不是制造个性。

## 24. 加载行为

不要使用骨架屏。

Mote 内容很少。

使用：

```text
Connecting…
```

并在合适处配合原生 ProgressView。

启动应在以下状态之间快速过渡：

```text
Loading
→ Connecting
→ Authenticating
→ Connected
```

## 25. 错误设计

错误应有三个层级。

### 行内

用于小的可恢复问题：

```text
Could not connect to relay.
Retrying automatically…
```

### 分区警告

用于配置问题：

```text
Accessibility permission required

Mote cannot execute Lock until permission is granted.

[Open System Settings]
```

### 严重

留给损坏的配置：

```text
Device credential is invalid.

Reconnect Mote with a valid device credential.
```

除非需要用户立即确认，否则避免模态警告。

## 26. 空状态

当 Mote 没有凭据时：

```text
Mote is not configured

Click Pair so Mote Relay can approve this Mac.

[Pair]
```

配对等待中：

```text
Waiting for approval

Mote Relay can see this Device ID. Allow it in the Dashboard.

[Cancel]
```

折叠的「Paste credential instead」只用于 CLI 恢复。不要显示虚假的断开指标或 `0 ms`。

## 27. 文案风格

Mote 界面文案应：

- 短
- 偏技术
- 直接
- 平静
- 不含糊

好的写法：

```text
Connected
Reconnecting…
Permission Required
Start at Login
Relay
Latency
Device ID
```

避免：

```text
You're all connected!
Everything is looking great!
Oops! Something went wrong.
Let's get you connected.
```

## 28. 命名规则

使用：

```text
Mote
Mote for Mac
Mote Agent
Mote Relay
Mote iOS
Relay
Remote Actions
Device
Connection
Pair
```

主界面避免不必要的技术术语。

例如，主界面：

```text
Relay
```

而不是：

```text
Persistent WebSocket Transport
```

技术措辞可以出现在 Advanced 下。

## 29. 浅色模式示例

```text
┌─────────────────────────────────────────────┐
│ MacBook Pro                                 │
│ ● Connected                                 │
│ Relay · 4 ms                                │
│                                             │
│ CONNECTION                                  │
│ Relay                       relay.yanze.me  │
│ Latency                              4 ms   │
│ Disconnect                                  │
│                                             │
│ REMOTE ACTIONS                              │
│ Lock                           Available    │
│                                             │
│ PERMISSIONS                                 │
│ Lock Permission                  Granted    │
│                                             │
│ STARTUP                                     │
│ Start Mote at Login                [ ON ]   │
│                                             │
│ DEVICE                                      │
│ Name                        MacBook Pro     │
│ Device ID                        7B0F…      │
│ Version                      1.5.1 (9)      │
└─────────────────────────────────────────────┘
```

视觉处理：

```text
background        #F7F8FA
surface           #FFFFFF
text              #17191C
secondary text    #626871
border            #E1E4E8
accent            #4F7CFF
connected         #2F9E63
```

## 30. 深色模式示例

```text
background        #101114
surface           #17191D
secondary surface #1E2126
text              #F4F5F7
secondary text    #A8ADB5
border            #2C3037
accent            #6B91FF
connected         #49C47D
```

深色模式应保持与浅色模式相同的层级和间距。

不要为深色模式单独重做界面。

## 31. 无障碍

要求：

- 不要只靠颜色传达状态
- 状态指示旁使用文本标签
- 尊重 Reduce Motion
- 在适用处尊重系统字号缩放
- 保持可读对比度
- 确保控件有无障碍标签
- 保持键盘导航
- 保持可见的焦点状态
- 不要使用过小的点击目标
- 使用语义化 SwiftUI 控件

例如：

差：

```text
●
```

好：

```text
● Connected
```

## 32. 响应行为

Mote 是桌面工具，不是响应式网站。

主布局应支持合理缩放，但保持紧凑的最大宽度。

建议内容宽度（与当前窗口一致）：

```text
460–520 px
```

避免在极宽窗口里把行拉满。

若用户放大窗口，应锚定内容并保持可读，而不是把每个元素都拉宽。

## 33. 平台材质

有选择地使用原生 macOS 材质。

适合：

- 菜单栏弹出层
- 工具栏
- 之后若增加的侧边栏
- 浮动状态表面

不要在每个内容分区后面都放模糊/材质。

设置更适合标准表面。

## 34. 应用图标方向

应用图标应遵循当前 macOS 图标惯例。

建议概念：

```text
深色中性底
+
简单的 Mote 中继/信号符号
+
轻微的 Mote Blue 强调
```

图标不应使用：

- 写实的 MacBook 插画
- 把挂锁当作整个 logo
- Wi-Fi 图标
- Siri logo
- Cloudflare 品牌
- 通用圆角方块里的字母

挂锁会错误地把 Mote 定位成「只锁屏的工具」。

视觉识别应更广义地代表远程动作 / 信号传递。

## 35. iOS 与后续传输

下一步是个人用原生 iPhone 应用，仍走 Relay HTTPS。再往后才可能出现本地 Bonjour 传输。

当前 Mac 头已经按传输行预留位置：

```text
MacBook Pro
● Connected
Relay · 4 ms
```

以后若有直连，只替换这一行：

```text
Direct · 2 ms
```

回退：

```text
Relay · 18 ms
```

不要让 Relay 品牌在结构上占据整个界面的中心。

Relay 是一种传输。

Mote 才是产品。

iOS 界面应同样克制：一个主动作（Lock）、清楚的 Mac 在线状态、失败时说明下一步。不要做成仪表盘。个人分发不上架，因此不要为 App Store 营销屏做视觉。

## 36. 建议的传输指示

使用简单标签：

```text
Direct
Relay
```

可选符号：

```text
Direct
point.3.connected.trianglepath.dotted

Relay
network
```

不要向普通用户暴露：

```text
TCP
Bonjour
WSS
Cloudflare
```

这些属于 Advanced。直连尚未实现；现在只显示 Relay。

## 37. 组件设计规则

### 状态行

```text
Label                      Value
Relay             relay.yanze.me
Latency                     4 ms
```

### 设置行

```text
Start Mote at Login        [ON]
```

### 权限行

```text
Lock Permission          Granted
```

### 错误行

```text
Lock Permission         Required
                     [Open Settings]
```

各分区保持一致对齐。

## 38. 颜色使用比例

界面颜色的大致分布：

```text
80–90% 中性表面/文本
5–10% Mote Blue
<5% 语义状态色
```

Mote Blue 应因为相对少见而显得有意。

不要用品牌色淹没应用。

## 39. 设计反模式

不要使用：

- 重度玻璃拟态布局
- 霓虹蓝渐变
- 发光的连接点
- 过大的 24 px 圆角
- 每个设置都用巨大卡片
- 仪表盘 KPI 磁贴
- 为 3 个设置做侧边栏导航
- 应用内的营销横幅
- 过多图标
- 自定义开关
- 自定义复选框
- 假终端美学
- 矩阵/黑客视觉语言
- 纯黑背景
- 到处纯白文字
- 已连接状态用过多绿色
- 大型延迟图表
- 表示正常健康状态的动画

## 40. 最终视觉方向

Mote 应看起来属于 macOS。

理想的第一印象是：

```text
小
快
原生
精确
安静
可靠
```

一切正常时，界面应消失在操作系统里。

最强的视觉识别应来自：

```text
Mote Blue
+
精确的字体
+
干净的原生间距
+
紧凑的中继/信号标记
```

而不是装饰性 UI。

## 41. 规范颜色 token

在设计和实现中一致使用这些名称。

### 浅色

```text
mote.canvas              #F7F8FA
mote.surface             #FFFFFF
mote.surface.secondary   #F1F3F6

mote.border              #E1E4E8
mote.border.strong       #CDD2D9

mote.text.primary        #17191C
mote.text.secondary      #626871
mote.text.tertiary       #9097A1

mote.accent              #4F7CFF
mote.accent.hover        #416DEB
mote.accent.soft         #E9EFFF

mote.success             #2F9E63
mote.warning             #C88719
mote.error               #D54848
mote.offline             #8A9099
```

### 深色

```text
mote.canvas              #101114
mote.surface             #17191D
mote.surface.secondary   #1E2126
mote.surface.elevated    #25282E

mote.border              #2C3037
mote.border.strong       #3A3F48

mote.text.primary        #F4F5F7
mote.text.secondary      #A8ADB5
mote.text.tertiary       #737A84

mote.accent              #6B91FF
mote.accent.hover        #7FA0FF
mote.accent.soft         #1E2B52

mote.success             #49C47D
mote.warning             #E7A83A
mote.error               #F06A6A
mote.offline             #777E88
```

## 42. 实现指引

在 SwiftUI 中实现时：

在与 macOS 行为自然匹配处，优先使用语义化系统颜色。

显式 Mote token 主要用于：

- 品牌强调色
- 带品牌感的柔和强调表面
- Mote 语义状态
- 不适合原生材质的自定义表面

不要不必要地替换 macOS 语义色，例如：

```text
primary
secondary
separator
windowBackground
controlBackground
```

如果系统提供的行为更好。

Mote 的设计语言应补充 macOS，而不是对抗它。

## 43. Web Dashboard

**Mote Relay Dashboard** 使用本文件中的同一套浅色/深色 token，而不是另一套管理后台品牌。它是浏览器里的克制控制台：内容宽度约 1100–1200 px，紧凑行，细边框，没有大型分析卡片。系统外观（`prefers-color-scheme`）即可，不必做手动主题开关。
