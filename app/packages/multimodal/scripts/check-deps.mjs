import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Checking dependencies integrity for multimodal");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  bin("yarn"),
  [
    "exec",
    "depcruise",
    "--config",
    "packages/multimodal/.dependency-cruiser.cjs",
    "packages/multimodal",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  }
);
