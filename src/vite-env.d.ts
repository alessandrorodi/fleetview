/// <reference types="vite/client" />

// Optional local-dev prefill (via .env.local — gitignored). Lets you point the
// app at real data without pasting a token into the UI. Never commit .env.local.
interface ImportMetaEnv {
  readonly VITE_GH_TOKEN?: string;
  readonly VITE_GH_HOST?: string;
  readonly VITE_GH_QUERY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
