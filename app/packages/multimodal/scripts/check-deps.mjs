import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

console.log("Checking dependencies integrity for multimodal");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  "yarn",
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
