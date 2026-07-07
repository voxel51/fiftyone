import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bin } from "./process.mjs";

console.log("Checking types for embeddings-v2");

const localDiagnosticPattern =
  /^(packages[\\/]embeddings-v2|node_modules[\\/]@fiftyone[\\/]embeddings-v2)[\\/]/;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

let output = "";

try {
  execFileSync(
    bin("yarn"),
    [
      "exec",
      "tsc",
      "--noEmit",
      "-p",
      "packages/embeddings-v2/tsconfig.json",
      "--pretty",
      "false",
    ],
    {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
} catch (error) {
  const stdout = typeof error.stdout === "string" ? error.stdout : "";
  const stderr = typeof error.stderr === "string" ? error.stderr : "";
  output = [stdout, stderr].filter(Boolean).join("\n");
  if (!output) {
    throw error;
  }
}

const localDiagnostics = output
  .split("\n")
  // Workspace source dependencies still surface in this package check, so only
  // fail diagnostics owned by the embeddings-v2 package boundary.
  .filter((line) => localDiagnosticPattern.test(line));

if (localDiagnostics.length) {
  console.error(localDiagnostics.join("\n"));
  process.exit(1);
}

if (output) {
  console.log(
    "No type issues in packages/embeddings-v2 🚀. TypeScript reported diagnostics outside packages/embeddings-v2; ignoring them for this package-local check.",
  );
}
