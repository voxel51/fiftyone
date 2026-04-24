import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

console.log("Running lint for multimodal");

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

execFileSync(
  "yarn",
  [
    "exec",
    "eslint",
    "--no-eslintrc",
    "--config",
    "packages/multimodal/.eslintrc.js",
    "packages/multimodal/src/**/*.{ts,tsx}",
    "--ignore-pattern",
    "packages/multimodal/src/**/__generated__/**",
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
  }
);
