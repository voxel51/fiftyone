import { dependencyCruiserGate } from "./dependency-cruiser-gate.mjs";
import {
  loadDependencyGraph,
  reportDependencyCruiserViolations,
} from "./dependency-cruiser-runner.mjs";

const gate = dependencyCruiserGate(loadDependencyGraph());

if (gate.exitCode !== 0) {
  reportDependencyCruiserViolations();
  console.error(
    `Multimodal dependencies failed: ${gate.error} error(s), ${gate.warn} warning(s)`,
  );
  process.exit(gate.exitCode);
}

console.log("Multimodal dependencies verified");
