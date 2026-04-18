import { defineConfig, env } from "prisma/config";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
