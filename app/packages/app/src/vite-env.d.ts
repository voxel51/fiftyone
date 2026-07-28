/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly IS_PLAYWRIGHT?: boolean;
}
