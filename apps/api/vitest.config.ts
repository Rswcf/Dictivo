import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sharedSource = fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@dictivo/shared": sharedSource
    }
  }
});
