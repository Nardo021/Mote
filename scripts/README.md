# 脚本

| 脚本 | 作用 |
| --- | --- |
| `ensure-worker-types.mjs` | 用 Wrangler 生成 `relay/worker-configuration.d.ts`。该文件不入库 |
| `check-repository.mjs` | Bundle ID、遗留迁移身份、示例 Relay 主机名、测试计划和 CI/部署边界 |
| `check-worker-bundle.mjs` | 干跑产物里必须有 `MoteRelay`，且不能带回已删除的 Node 服务器标记 |

仓库根的 `npm test` 会跑一致性检查。`npm run typecheck` 会先生成 Worker 类型。

设备和 token 在 Dashboard 里管理。Mac 用 **Pair**，Dashboard **Allow**。没有用来改 Cloudflare 上数据库的 CLI。不要在这里放密钥或真实主机名。
