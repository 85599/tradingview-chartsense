import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const config = {
  reactStrictMode: true,
  turbopack: { root },
};

export default config;
