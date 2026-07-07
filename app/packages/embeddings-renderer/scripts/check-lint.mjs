import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Running lint for embeddings-renderer");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  bin("yarn"),
  [
    "exec",
    "eslint",
    // Top level eslint has too-liberal rules and plugins like "only-warn"
    // that we want to supersede
    "--no-eslintrc",
    "--config",
    "packages/embeddings-renderer/.eslintrc.js",
    "packages/embeddings-renderer/src/**/*.{ts,tsx}",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);
