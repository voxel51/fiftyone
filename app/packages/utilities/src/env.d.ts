/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API?: string;
  readonly VITE_HAS_UPDATES: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// FiftyOne server injects these globals at runtime
interface Window {
  FIFTYONE_SERVER_ADDRESS?: string;
  FIFTYONE_SERVER_PATH_PREFIX?: string;
}
