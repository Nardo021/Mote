# GitHub Actions

CI 工作流将放在这里。当前仓库还没有 workflow YAML。

若添加 CI，应对已经落地的工程跑构建与测试：

```text
macos/     xcodebuild test
relay/     npm test && npm run typecheck
dashboard/ npm test && npm run typecheck
```

不要再写「尚未实现」的占位任务。不要把 Team ID、证书或生产密钥放进 workflow。
