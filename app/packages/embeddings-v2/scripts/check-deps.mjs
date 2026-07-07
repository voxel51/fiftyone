import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Checking dependencies integrity for embeddings-v2");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  bin("yarn"),
  [
    "exec",
    "depcruise",
    "--config",
    "packages/embeddings-v2/.dependency-cruiser.cjs",
    "packages/embeddings-v2",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);
