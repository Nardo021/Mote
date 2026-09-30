# 代码签名

Windows 的正式公开发布应当做 Authenticode 签名。当前仓库没有受信任的签名身份，也没有把任何证书或私钥放进 Git。

状态：

| 状态 | 含义 |
| --- | --- |
| `UNSIGNED_RC` | 未签名的候选包，只能用来测试 |
| `TEST_SIGNED` | 作业里临时自签的副本。不是可发布的信任链 |
| `PRODUCTION_SIGNED` | 受信任的生产签名。现在还没有 |

`PRODUCTION_TRUSTED_SIGNING_NOT_EXECUTED`

自签测试通过只说明 SignTool 和 SHA-256 这条路径能用。它不能把构建叫做生产签名。测试证书不放进受信任的根证书库：Windows 对这一步会弹出确认，CI 里会卡住。校验看到的是 SHA-256 文件摘要；改动已签名的副本后，状态变为哈希不匹配。`signtool verify /pa` 对这张临时证书不会返回成功，因为信任链停在一个不受信任的根上。这是预期结果。

## 构建从哪里来

Windows 包只从当前检出的提交发布：

```text
dotnet publish windows/src/Mote.Windows/Mote.Windows.csproj -c Release -r win-x64 --self-contained true
```

单文件成功时，zip 里只有 `Mote.Windows.exe`。签名发生在打包之前。测试签名签的是另一份会被删除的副本，公开的 zip 保持 `UNSIGNED_RC`。生产签名如果以后启用，顺序是：发布、签名、验证、再打包、再计算 SHA-256。不要先打包再改 zip 里的文件。

单文件时只签 `Mote.Windows.exe`。不签嵌在里面的 .NET 运行时，那些不是 Mote 自己的二进制。

产物旁边可以有 `release-manifest.json`，里面是版本、RID、提交、SDK、签名状态和 zip 的 SHA-256。不要把证书、密码或私钥写进去。

## 现在可以怎么签

还没有选定已经开通的生产提供者。工作流只留一个入口：`mode=production` 在没有提供者时失败。不要同时接上好几套都会真正签名的路径。

### SignPath Foundation

开源项目可以调查 SignPath Foundation。Mote 还没有申请，也没有被接受。在接受之前不要写“由 SignPath Foundation 签名”，也不要放它的标识。如果以后走这条路，再单独满足它的开源要求。

### 受信任的 OV 代码签名证书

可以用 SignTool，或证书商要求的签名方式。私钥按证书商的要求保管，不进仓库。文件摘要用 SHA-256。提供者支持或要求时间戳时，再用它推荐的 RFC 3161 服务。不要在仓库里写死一个任意的时间戳地址。

可能用到的 GitHub Secret 名字，只作为类别，仓库里没有值：

| Secret | 用途 |
| --- | --- |
| `WINDOWS_CODESIGN_CERTIFICATE` | 代码签名证书 |
| `WINDOWS_CODESIGN_PASSWORD` | 该证书的密码 |

### Azure Artifact Signing

只有发布者符合条件时才是一个选项。它不是这次的默认路径。如果要用，再按它的要求给签名作业单独开 `id-token: write`。普通构建保持 `contents: read`。

### Microsoft Store

以后的分发选项。这次不把 Mote 做成 MSIX，也不上架。

## 隐私和网络

打包没有加遥测。Windows Agent 只连接设置里的 Relay。设备凭据在 Windows Credential Manager。没有 Windows 服务，正常使用也不要管理员权限。`lock` 仍是唯一动作。

签名验证的是发布者身份和文件完整性。它不改变协议信任，也不表示这台设备可以跳过配对或凭据校验。

## 负责任的发布

- 未签名包明确标成 `UNSIGNED_RC`，不叫正式版。
- 测试证书在作业里生成。签名时私钥只出现在该作业的临时 pfx 里，签完立刻删除，不上传。证书随后从证书库删除。
- 不把测试签名的可执行文件当作正式产物上传。
- 生产模式缺少签名配置时失败，而不是悄悄交出未签名包。
- 不建议用户关闭 SmartScreen 或系统范围的安全保护。新的直接下载程序即使签过名，也可能仍然被提示。
