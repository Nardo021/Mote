# GitHub Actions

`deploy-cloudflare.yml` 在推送到 `main` 时部署 Worker。未设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 时会跳过。

若添加 CI，应对已经落地的工程跑构建与测试：

```text
macos/     xcodebuild test
relay/     npm test && npm run typecheck
dashboard/ npm test && npm run typecheck
```

不要再写「尚未实现」的占位任务。不要把 Team ID、证书、生产密钥或真实主机名放进 workflow。
