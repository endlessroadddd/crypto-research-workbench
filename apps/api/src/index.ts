import { buildApp } from "./app";

const start = async (): Promise<void> => {
  const app = await buildApp();
  await app.listen({
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000)
  });
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

