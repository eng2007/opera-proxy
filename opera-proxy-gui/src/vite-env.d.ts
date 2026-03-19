/// <reference types="vite/client" />

import type { OperaProxyApi } from "../electron/preload";

declare global {
  interface Window {
    operaProxyApi: OperaProxyApi;
  }
}

export {};
