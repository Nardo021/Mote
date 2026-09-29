# deploy

这个目录以前放 Docker Compose 和 Proxmox VE 说明。那些文件已经删除。

**历史：** 更早的 Mote 可以用 Node/Fastify 容器自托管，前面再加反向代理或 Cloudflare Tunnel。那不再是支持的部署。

当前生产拓扑只有 Cloudflare Worker、一个 `MoteRelay` Durable Object、Durable Object SQLite，以及 Workers Assets。步骤见 [docs/deployment.md](../docs/deployment.md) 和仓库根 README。
