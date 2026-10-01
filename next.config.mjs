import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  // The database drivers run as plain Node modules, not bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Migrations are read at runtime by the local database and `npm run db:migrate`.
  outputFileTracingIncludes: { "/**/*": ["./drizzle/**/*"] },
  // Uploads go through server actions; allow files up to 10 MB plus form fields.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
