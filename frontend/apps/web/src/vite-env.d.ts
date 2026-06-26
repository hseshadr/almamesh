/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_E2E?: string
  // Local-first LLM config (optional; defaults to a local Ollama endpoint).
  readonly VITE_LLM_API_BASE?: string
  readonly VITE_LLM_API_KEY?: string
  readonly VITE_LLM_MODEL?: string
  readonly VITE_LLM_PRIVACY_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
