const typeAwareRules = require("@typescript-eslint/eslint-plugin").configs[
  "recommended-requiring-type-checking"
].rules;

// Add directories here only after their type-aware lint findings are resolved.
// Paths are relative to the app workspace, where check-lint.mjs invokes ESLint,
// and intentionally explicit so that the migration state is visible in review.
const migratedDirectories = [
  "packages/multimodal/src/codecs/**/*.{ts,tsx}",
  "packages/multimodal/src/decoders/**/*.{ts,tsx}",
  "packages/multimodal/src/inject/**/*.{ts,tsx}",
  "packages/multimodal/src/ir/**/*.{ts,tsx}",
  "packages/multimodal/src/observability/**/*.{ts,tsx}",
  "packages/multimodal/src/ports/**/*.{ts,tsx}",
  "packages/multimodal/src/scene-inventory/**/*.{ts,tsx}",
  "packages/multimodal/src/stream-selection/**/*.{ts,tsx}",
  "packages/multimodal/src/utils/**/*.{ts,tsx}",
];

module.exports = { migratedDirectories, typeAwareRules };
