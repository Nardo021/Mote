# 脚本

仓库级辅助脚本可以放在这里。

Mote Relay 的凭据管理使用 Relay CLI：

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
