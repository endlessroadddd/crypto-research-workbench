import { buildApp } from "./app";

const start = async (): Promise<void> => {
  const app = await buildApp();
  await app.listen({
    host: "127.0.0.1",
    port: 3000
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

