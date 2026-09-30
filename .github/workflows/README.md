# GitHub Actions

CI、部署和 macOS 发行是三件分开的事。

```text
pull request / push main 或 mote-v2
        │
        ▼
      CI
      ├── Relay / Protocol
      ├── Dashboard
      ├── Worker dry-run
      ├── macOS safe tests
      ├── Windows agent tests
      ├── Windows release artifact
      └── repository consistency
        │
        │  only a successful push to main
        ▼
 Deploy Cloudflare
```

`ci.yml` 跑测试、类型检查、Dashboard 生产构建、`wrangler deploy --dry-run`，以及 Windows 上的 `dotnet test`。它不部署，也不使用 Developer ID，也不锁屏。

`deploy-cloudflare.yml` 在 CI 成功之后才可能部署。密钥只从 GitHub Secrets 读取。未设置 `CLOUDFLARE_API_TOKEN` 或 `CLOUDFLARE_ACCOUNT_ID` 时跳过，并且不打印。

`release-macos.yml` 只在手动运行或 `vX.Y.Z` tag 上签名、公证并发布。缺少 Apple 密钥时失败，不上传未签名包。说明见 [docs/release.md](../../docs/release.md)。

`build-windows-release.yml` 构建未签名的 Windows 便携包。它可以手动运行，CI 也会调用它。它不监听 `vX.Y.Z`，也不创建 GitHub Release。`mode=production` 在没有受信任签名时失败。

不要把 Team ID、证书、生产密钥或真实主机名写进 workflow。
