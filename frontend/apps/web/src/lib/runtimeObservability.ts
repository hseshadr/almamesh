declare global {
  interface Window {
    __ALMAMESH_STAGE__?: string
    __ALMAMESH_ERROR__?: string
  }
}

export const publishRuntimeStage = (stage: string): void => {
  window.__ALMAMESH_STAGE__ = stage
}

export const publishRuntimeError = (message: string): void => {
  window.__ALMAMESH_ERROR__ = message
}
