import type { Express, Request, Response } from 'express'

export type App = Express
export type Req = Request
export type Res = Response

export interface EspnCreds {
  swid?: string
  espnS2?: string
}

/** Anything shaped like a request that carries ESPN auth headers (real or synthetic). */
export interface HeaderCarrier {
  headers?: Record<string, unknown>
}

declare global {
  namespace Express {
    interface Request {
      ffpSwid?: string
      ffpEspnS2?: string
    }
  }
}
