import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Checking dependencies integrity for reverb");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  bin("yarn"),
  [
    "exec",
    "depcruise",
    "--config",
    "packages/reverb/.dependency-cruiser.cjs",
    "packages/reverb",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);
