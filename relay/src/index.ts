import { buildApp } from "./app.js";
import { createAppContext } from "./appContext.js";
import { loadConfig, loadLocalEnvFiles } from "./config/env.js";
import { openDatabase } from "./storage/database.js";

async function main(): Promise<void> {
  loadLocalEnvFiles();
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const ctx = createAppContext(config, db);
  const app = await buildApp(ctx);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, "error during shutdown");
    } finally {
      try {
        db.close();
      } catch {
        // already closed
      }
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      host: config.host,
      port: config.port,
      public_url: config.publicUrl,
      env: config.env,
    },
    "server startup",
  );
  app.log.info({ database_path: config.databasePath }, "database ready");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "startup failed";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
