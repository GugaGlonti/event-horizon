/// <reference types="vite/client" />

// Only explicitly declared VITE_ variables may be read from import.meta.env.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}
