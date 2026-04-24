import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

console.log("Checking types for multimodal");

const localDiagnosticPattern =
  /^(packages\/multimodal|node_modules\/@fiftyone\/multimodal)\//;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));

let output = "";

try {
  execFileSync(
    "yarn",
    [
      "exec",
      "tsc",
      "--noEmit",
      "-p",
      "packages/multimodal/tsconfig.json",
      "--pretty",
      "false",
    ],
    {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
} catch (error) {
  output = `${error.stdout || ""}${error.stderr || ""}`;
  if (!output) {
    throw error;
  }
}

const localDiagnostics = output
  .split("\n")
  // Workspace source dependencies still surface in this package check, so only
  // fail diagnostics owned by the multimodal package boundary.
  .filter((line) => localDiagnosticPattern.test(line));

if (localDiagnostics.length) {
  console.error(localDiagnostics.join("\n"));
  process.exit(1);
}

if (output) {
  console.log(
    "No type issues in packages/multimodal 🚀. TypeScript reported diagnostics outside packages/multimodal; ignoring them for this package-local check."
  );
}
