import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Checking dependencies integrity for embeddings-renderer");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  bin("yarn"),
  [
    "exec",
    "depcruise",
    "--config",
    "packages/embeddings-renderer/.dependency-cruiser.cjs",
    "packages/embeddings-renderer",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);
