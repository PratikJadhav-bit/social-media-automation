import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
process.env.DATABASE_PATH = `data/test-${Date.now()}.sqlite`;
process.env.MEDIA_DIR = `data/test-media-${Date.now()}`;
process.env.PROVIDER_MODE = "mock";
process.env.PUBLISH_MODE = "mock";
// Preserve coverage of the retained legacy adapters; manual delivery tests override this.
process.env.DELIVERY_MODE = "automatic";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
