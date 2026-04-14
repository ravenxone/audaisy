declare global {
  interface Window {
    __AUDAISY_RUNTIME_BASE_URL__?: string;
    __AUDAISY_RUNTIME_STARTUP_ERROR__?: string;
  }
}

export function readRuntimeBaseUrl() {
  return window.__AUDAISY_RUNTIME_BASE_URL__ ?? null;
}

export function readRuntimeStartupError() {
  return window.__AUDAISY_RUNTIME_STARTUP_ERROR__ ?? null;
}
