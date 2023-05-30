/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH0_AUDIENCE: string;
  readonly VITE_AUTH0_CLIENT_ID: string;
  readonly VITE_AUTH0_DOMAIN: string;
  readonly VITE_AUTH0_;
  readonly VITE_API?: string;
  readonly VITE_HAS_UPDATES: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
