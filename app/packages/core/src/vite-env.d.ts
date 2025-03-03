/// <reference types="vite/client" />

interface Window {
  readonly IS_PLAYWRIGHT?: boolean;
}

interface ImportMetaEnv {
  readonly VITE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
