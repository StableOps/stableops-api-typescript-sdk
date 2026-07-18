// 与服务端约束保持一致：所有写请求允许带 Idempotency-Key。
// 读请求不需要传，避免在错误的请求上消耗服务端的去重存储。

import { version } from '../package.json'

import {
  computeDelayMs,
  isRetryableError,
  isRetryableStatus,
  parseRetryAfterMs,
  type BackoffOptions,
} from './retry'

export const IDEMPOTENCY_HEADER = 'idempotency-key'

export type RetryOptions = {
  maxRetries?: number // 默认 2（最多 3 次尝试）
  baseDelayMs?: number // 默认 200
  maxDelayMs?: number // 默认 5000
}

// debug 输出钩子：true → console.debug；函数 → 自定义 logger（结构化日志、上报等）。
// 任何形态下都会先经过脱敏：请求与响应 headers（apiKey / authorization / idempotency-key /
// cookie），以及请求 / 响应 body 中的已知敏感字段（secret / portal_token / client_secret）。
export type DebugLogger = (event: DebugEvent) => void
export type DebugOption = boolean | DebugLogger

export type DebugEvent =
  | { type: 'init'; config: Record<string, unknown> }
  | {
      type: 'request'
      method: string
      url: string
      headers: Record<string, string>
      body: unknown
      attempt: number
    }
  | {
      type: 'response'
      method: string
      url: string
      status: number
      durationMs: number
      headers: Record<string, string>
      body: unknown
      attempt: number
    }
  | {
      type: 'error'
      method: string
      url: string
      attempt: number
      durationMs: number
      error: { name?: string; message: string }
    }

export type ClientOptions = {
  apiKey?: string
  baseUrl?: string
  // 注入自定义 fetch（测试 / Node18- 兼容 / 自托管 proxy）。
  fetch?: typeof fetch
  // 单次尝试的超时（毫秒），默认 30000。每次尝试（含重试）独立计时，
  // 最坏总耗时 ≈ (maxRetries + 1) × timeoutMs + 退避等待之和。
  // 标准 fetch 不暴露 connect/read 阶段，故不区分两者，保证跨运行时可移植。
  timeoutMs?: number
  retry?: RetryOptions
  // 打开后会输出初始化配置 / 每次请求 / 每次响应到 console.debug（或自定义 logger）。
  // 敏感字段会自动脱敏（apiKey 仅保留前 4 + 后 4 字符；headers 中的 authorization /
  // idempotency-key / cookie 与 body 中的 secret / portal_token / client_secret 同样规则）。
  debug?: DebugOption
  // 内部测试钩子：注入确定性 sleep / random，使重试测试秒级完成且不 flaky。
  _sleep?: (ms: number) => Promise<void>
  _random?: () => number
  // 内部测试钩子：固定时间戳来源，避免快照断言依赖真实时钟。
  _now?: () => number
}

export type RequestInit = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
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

// 幂等键生成：优先 crypto.randomUUID。浏览器的非安全上下文（非 localhost 的 http://）
// 只有 getRandomValues 没有 randomUUID，此时按 RFC 4122 手工拼一个 UUID v4 兜底。
function generateIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID()
  const bytes = new Uint8Array(16)
  cryptoObj.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
  private readonly now: () => number
  private readonly debug: DebugLogger | null

  constructor(options: ClientOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
    // 原生 fetch 必须以 window/globalThis 为 this 调用；存成实例字段后用 this.fetchImpl(...)
    // 调用会把 this 变成本类实例，浏览器报 "Illegal invocation"。回退到全局 fetch 时绑定 this。
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis)
    this.headers = {
      'content-type': 'application/json',
      accept: 'application/json',
    }
    // user-agent 是 fetch 规范定义的 forbidden header：浏览器里 Chrome 静默丢弃、
    // Safari 严格地把它放进 CORS 预检的 Access-Control-Request-Headers 直接 fail。
    // 浏览器会自动带自己的 UA，无需 SDK 设置；只有 Node/Bun/Deno 这类无 document 的运行时需要。
    if (typeof document === 'undefined') {
      this.headers['user-agent'] = `StableOpsSDK/${version}`
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
    this.now = options._now ?? (() => Date.now())
    this.debug = resolveDebugLogger(options.debug)
    if (this.debug) {
      this.debug({
        type: 'init',
        config: {
          baseUrl: this.baseUrl,
          apiKey: maskSecret(options.apiKey),
          timeoutMs: this.timeoutMs,
          maxRetries: this.maxRetries,
          baseDelayMs: this.backoff.baseDelayMs,
          maxDelayMs: this.backoff.maxDelayMs,
          fetch: options.fetch ? 'custom' : 'global',
        },
      })
    }
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
      init.idempotencyKey ?? (init.method === 'GET' ? undefined : generateIdempotencyKey())
    if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey

    let body: string | undefined
    if (init.body !== undefined) {
      try {
        body = JSON.stringify(init.body)
      } catch (err) {
        // 循环引用等序列化失败也包装为 StableOpsError，维持「调用方只需 catch 一种错误类型」。
        throw new StableOpsError(
          0,
          'serialization_error',
          err instanceof Error ? err.message : String(err),
          err,
        )
      }
    }
    const canRetry = init.method === 'GET' || init.retryable === true

    const urlStr = url.toString()

    for (let attempt = 0; ; attempt++) {
      // 每次尝试独立的 AbortController + 计时器：超时表现为 AbortError，归入可重试错误。
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      const startedAt = this.now()
      let retryDelayMs: number
      if (this.debug) {
        this.debug({
          type: 'request',
          method: init.method,
          url: urlStr,
          headers: maskHeaders(headers),
          body: maskBodySecrets(init.body),
          attempt,
        })
      }
      try {
        const res = await this.fetchImpl(urlStr, {
          method: init.method,
          headers,
          body,
          signal: controller.signal,
        })
        const text = await res.text()
        const parsed = text.length === 0 ? null : safeJsonParse(text)
        if (this.debug) {
          this.debug({
            type: 'response',
            method: init.method,
            url: urlStr,
            status: res.status,
            durationMs: this.now() - startedAt,
            headers: maskHeaders(headersToRecord(res.headers)),
            body: maskBodySecrets(parsed),
            attempt,
          })
        }
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
        if (this.debug) {
          this.debug({
            type: 'error',
            method: init.method,
            url: urlStr,
            attempt,
            durationMs: this.now() - startedAt,
            error: {
              name: err instanceof Error ? err.name : undefined,
              message: err instanceof Error ? err.message : String(err),
            },
          })
        }
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

// 脱敏：对 apiKey / token / idempotency-key 等明文字段保留首尾各 4 字符，中间用 *** 代替。
// 长度 ≤ 8 时整段替换，避免泄露完整值。
export function maskSecret(value: string | undefined | null): string | undefined {
  if (value == null) return undefined
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}***${value.slice(-4)}`
}

const SENSITIVE_HEADERS = new Set(['authorization', IDEMPOTENCY_HEADER, 'cookie', 'set-cookie'])

// body 中的已知敏感字段：webhook secret、portal token、checkout client secret。
// 同时覆盖 snake_case（wire 格式）与 camelCase（调用方自带 body）两种写法。
const SENSITIVE_BODY_FIELDS = new Set([
  'secret',
  'portal_token',
  'portalToken',
  'client_secret',
  'clientSecret',
])

// 递归脱敏 body 中的敏感字段。不修改原对象；深度设上限防御自引用 / 超深结构。
function maskBodySecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => maskBodySecrets(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] =
      SENSITIVE_BODY_FIELDS.has(k) && typeof v === 'string'
        ? (maskSecret(v) ?? '***')
        : maskBodySecrets(v, depth + 1)
  }
  return out
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(k.toLowerCase())) {
      // authorization 通常是 "Bearer xxx"：保留 scheme + 脱敏 token。
      if (k.toLowerCase() === 'authorization' && v.startsWith('Bearer ')) {
        out[k] = `Bearer ${maskSecret(v.slice(7)) ?? '***'}`
      } else {
        out[k] = maskSecret(v) ?? '***'
      }
    } else {
      out[k] = v
    }
  }
  return out
}

function headersToRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((v, k) => {
    out[k] = v
  })
  return out
}

function resolveDebugLogger(opt: DebugOption | undefined): DebugLogger | null {
  if (!opt) return null
  if (typeof opt === 'function') return opt
  return (event) => {
    // 默认 logger：走 console.debug，前缀 "[stableops]" 方便过滤。
    console.debug('[stableops]', event)
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
