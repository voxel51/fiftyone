import { defineConfig } from "@voxel51/fiftyone-js-plugin-build";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const dir = dirname(__filename);

// `defineConfig` throws unless FIFTYONE_DIR points at the fiftyone repo root
// — its private-package resolver needs it. The `build` script exports it.
//
// Only @fiftyone/*, react, react-dom, @mui/material, recoil and
// styled-components are externalized: @voxel51/voodo is bundled into the
// UMD, since the App does not expose it to plugins. voodo styles through
// prebuilt classes over the app's globally imported theme.css rather than a
// React theme context, so the duplicate module instance still themes.
export default defineConfig(dir, {
  buildConfigOverride: { sourcemap: true },
});
