// SDK 网络弹性的纯决策逻辑：与计时 / 网络解耦，可单独测试且测试不真等。
// http.ts 的重试循环把这里的判定与延迟计算组合起来；本文件不做任何 I/O。

// 可重试状态：429（限流）或任意 5xx（服务端临时故障）。
// 4xx（含 401/409/400）是确定性失败，重试无意义，立即抛出。
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

// 可重试错误：网络层失败（fetch reject，跨运行时通常是 TypeError）
// 或本次尝试超时（AbortController abort → AbortError）。
// 已包装成 StableOpsError 的业务错误不归此类（由 http.ts 先行拦截原样抛出）。
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || err.name === 'TypeError'
}

export type BackoffOptions = {
  baseDelayMs: number
  maxDelayMs: number
}

// Retry-After 的兜底上限：正常调低 maxDelayMs 不应影响遵守服务端限流指示，
// 但也不能让配置错误的网关 / 被劫持的代理用超长 Retry-After 无限挂起调用方。
// 实际上限取 max(maxDelayMs, 30s)：默认配置下最多等 30s，调大 maxDelayMs 可放宽。
const RETRY_AFTER_CAP_MS = 30_000

// 第 attempt 次重试（attempt 从 0 开始）的退避延迟（毫秒）：
//   base  = min(maxDelayMs, baseDelayMs * 2 ** attempt)   // 指数退避，封顶 maxDelayMs
//   delay = retryAfterMs ?? random() * base                // full jitter，避免重试惊群
// 存在 Retry-After 时优先遵守服务端指示，但 clamp 到 max(maxDelayMs, RETRY_AFTER_CAP_MS)。
export function computeDelayMs(
  attempt: number,
  opts: BackoffOptions,
  random: () => number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, Math.max(opts.maxDelayMs, RETRY_AFTER_CAP_MS))
  }
  const base = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt)
  return random() * base
}

// 解析 Retry-After 响应头。只认「秒数」形式：HTTP 也允许 HTTP-date，但跨运行时
// 解析日期易错、且本 API 不会下发 date 形态，故非数字一律视为缺省返回 undefined。
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null) return undefined
  const trimmed = header.trim()
  if (trimmed.length === 0) return undefined
  const seconds = Number(trimmed)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return seconds * 1000
}
