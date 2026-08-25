import { buildServer } from "./server.js";

const server = await buildServer();

const port = Number(process.env.PORT ?? 4000);
server
  .listen({ port, host: "0.0.0.0" })
  .then(() => server.log.info(`API listening on :${port}`))
  .catch((err) => {
    server.log.error(err);
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
