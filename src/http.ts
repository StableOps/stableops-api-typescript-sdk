// 与服务端约束保持一致：所有写请求允许带 Idempotency-Key。
// 读请求不需要传，避免在错误的请求上消耗服务端的去重存储。

import {
  computeDelayMs,
  isRetryableError,
  isRetryableStatus,
  parseRetryAfterMs,
  type BackoffOptions,
} from './retry'

export const ORG_HEADER = 'x-stableops-org'
export const ENV_HEADER = 'x-stableops-env'
export const IDEMPOTENCY_HEADER = 'idempotency-key'

export type StableOpsEnvironment = 'sandbox' | 'live'

export type RetryOptions = {
  maxRetries?: number // 默认 2（最多 3 次尝试）
  baseDelayMs?: number // 默认 200
  maxDelayMs?: number // 默认 5000
}

export type ClientOptions = {
  apiKey?: string
  baseUrl?: string
  organizationSlug?: string
  environment?: StableOpsEnvironment
  // 注入自定义 fetch（测试 / Node18- 兼容 / 自托管 proxy）。
  fetch?: typeof fetch
  // 单一总超时（毫秒），默认 30000。逐次尝试独立计时（含每次重试）；
  // 标准 fetch 不暴露 connect/read 阶段，故不区分两者，保证跨运行时可移植。
  timeoutMs?: number
  retry?: RetryOptions
  // 内部测试钩子：注入确定性 sleep / random，使重试测试秒级完成且不 flaky。
  _sleep?: (ms: number) => Promise<void>
  _random?: () => number
}

export type RequestInit = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  query?: Record<string, string | number | undefined>
  idempotencyKey?: string
  retryable?: boolean
}

const DEFAULT_BASE_URL = 'https://api.stableops.dev'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_BASE_DELAY_MS = 200
const DEFAULT_MAX_DELAY_MS = 5_000

export class StableOpsError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message)
    this.name = 'StableOpsError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class HttpClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly backoff: BackoffOptions
  private readonly sleep: (ms: number) => Promise<void>
  private readonly random: () => number

  constructor(options: ClientOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
    // 原生 fetch 必须以 window/globalThis 为 this 调用；存成实例字段后用 this.fetchImpl(...)
    // 调用会把 this 变成本类实例，浏览器报 "Illegal invocation"。回退到全局 fetch 时绑定 this。
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis)
    this.headers = {
      'content-type': 'application/json',
      accept: 'application/json',
      [ORG_HEADER]: options.organizationSlug ?? 'demo',
      [ENV_HEADER]: options.environment ?? 'sandbox',
    }
    if (options.apiKey) {
      this.headers.authorization = `Bearer ${options.apiKey}`
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.retry?.maxRetries ?? DEFAULT_MAX_RETRIES
    this.backoff = {
      baseDelayMs: options.retry?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
      maxDelayMs: options.retry?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    }
    this.sleep = options._sleep ?? defaultSleep
    this.random = options._random ?? Math.random
  }

  async request<T>(init: RequestInit): Promise<T> {
    const url = new URL(`${this.baseUrl}${init.path}`)
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined) continue
        url.searchParams.set(k, String(v))
      }
    }
    const headers: Record<string, string> = { ...this.headers }
    // 幂等键：调用方显式提供则用之；否则所有写请求（非 GET）在循环外只生成一次，
    // 并在全部重试中复用同一个键 —— 保证「服务端已成功、响应在途丢失」时重发不产生重复副作用。
    const idempotencyKey =
      init.idempotencyKey ?? (init.method === 'GET' ? undefined : globalThis.crypto.randomUUID())
    if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey

    const body = init.body === undefined ? undefined : JSON.stringify(init.body)
    const canRetry = init.method === 'GET' || init.retryable === true

    for (let attempt = 0; ; attempt++) {
      // 每次尝试独立的 AbortController + 计时器：超时表现为 AbortError，归入可重试错误。
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      let retryDelayMs: number
      try {
        const res = await this.fetchImpl(url.toString(), {
          method: init.method,
          headers,
          body,
          signal: controller.signal,
        })
        const text = await res.text()
        const parsed = text.length === 0 ? null : safeJsonParse(text)
        if (res.ok) return parsed as T

        if (canRetry && isRetryableStatus(res.status) && attempt < this.maxRetries) {
          // 可重试状态且仍有额度：Retry-After 优先，否则指数退避 + jitter。
          const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'))
          retryDelayMs = computeDelayMs(attempt, this.backoff, this.random, retryAfterMs)
        } else {
          // 4xx（含 401/409）或重试耗尽：抛业务错误，携带后端 body 供调用方读取。
          const errBody = parsed as Record<string, unknown> | null
          throw new StableOpsError(
            res.status,
            (errBody?.code as string) ?? `http_${res.status}`,
            (errBody?.message as string) ?? res.statusText,
            errBody,
          )
        }
      } catch (err) {
        // 已是业务错误（4xx / 已耗尽）：原样抛出，不再重试。
        if (err instanceof StableOpsError) throw err
        if (canRetry && isRetryableError(err) && attempt < this.maxRetries) {
          // 网络错误 / 超时且仍有额度：纯指数退避（无 Retry-After 可循）。
          retryDelayMs = computeDelayMs(attempt, this.backoff, this.random)
        } else {
          // 不可重试或已耗尽：统一包装为 StableOpsError（status=0），调用方只需 catch 一种错误类型。
          const isTimeout = err instanceof Error && err.name === 'AbortError'
          throw new StableOpsError(
            0,
            isTimeout ? 'timeout' : 'network_error',
            err instanceof Error ? err.message : String(err),
            err,
          )
        }
      } finally {
        clearTimeout(timer)
      }
      // 走到这里说明本次尝试已决定重试（上方未 return / throw）：退避等待后进入下一轮。
      await this.sleep(retryDelayMs)
    }
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
