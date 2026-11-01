/// <reference types="vite/client" />

// Only explicitly declared VITE_ variables may be read from import.meta.env.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_MULTIPLAYER_URL?: string;
  readonly VITE_NETWORK_DEBUG?: string;
  readonly VITE_NETWORK_LATENCY_MS?: string;
  readonly VITE_NETWORK_JITTER_MS?: string;
  readonly VITE_NETWORK_LOSS_PERCENT?: string;
  readonly VITE_INTERPOLATION_MS?: string;
}
