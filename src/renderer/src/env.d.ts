/// <reference types="vite/client" />

import type { AzimutApi } from '@shared/api'

declare global {
  interface Window {
    vela: AzimutApi
  }
}

export {}
