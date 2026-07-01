import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = env("DATABASE_URL");
const prismaUrl = databaseUrl.includes("schema=") ? databaseUrl : `${databaseUrl}${databaseUrl.includes("?") ? "&" : "?"}schema=course_studio`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: prismaUrl,
  },
});
