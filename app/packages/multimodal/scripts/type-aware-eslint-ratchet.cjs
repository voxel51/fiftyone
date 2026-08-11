const typeAwareRules = require("@typescript-eslint/eslint-plugin").configs[
  "recommended-requiring-type-checking"
].rules;

// The directory-by-directory ratchet is complete. Keep this explicit package
// source glob so new TypeScript files inherit semantic lint enforcement.
const migratedPaths = ["packages/multimodal/src/**/*.{ts,tsx}"];

module.exports = { migratedPaths, typeAwareRules };
