/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API?: string;
  readonly VITE_HAS_UPDATES: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly FIFTYONE_SERVER_ADDRESS?: string;
  readonly FIFTYONE_SERVER_PATH_PREFIX?: string;
}
