# 脚本

仓库级辅助脚本可以放在这里。当前目录主要是文档占位；凭据管理使用 Relay CLI，不要在这里放密钥。

生产设备应走 Mac **Pair** + Dashboard **Allow**。CLI 用于恢复、token 和管理员：

```text
cd relay
npm run cli -- device create --name "MacBook Pro" --id <MAC_DEVICE_ID>
npm run cli -- token create --name "Leo iPhone"
npm run cli -- admin create --username admin
```

生产：

```text
docker compose exec relay node dist/cli.js ...
```
