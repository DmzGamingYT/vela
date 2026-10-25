/// <reference types="vite/client" />

import type { VelaApi } from '@shared/api'

declare global {
  interface Window {
    vela: VelaApi
  }
}

export {}
