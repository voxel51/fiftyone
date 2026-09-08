import { verifyDependencyArchitecture } from "./dependency-architecture.mjs";
import { loadDependencyGraph } from "./dependency-cruiser-runner.mjs";

verifyDependencyArchitecture(loadDependencyGraph());

console.log("Multimodal dependency architecture verified");
