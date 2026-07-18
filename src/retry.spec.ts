import { describe, expect, it } from 'vitest'

import { computeDelayMs, isRetryableError, isRetryableStatus, parseRetryAfterMs } from './retry'

describe('isRetryableStatus', () => {
  it('429 与 5xx 可重试', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
  })

  it('2xx / 4xx（含 401/409）不可重试', () => {
    expect(isRetryableStatus(200)).toBe(false)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(409)).toBe(false)
    expect(isRetryableStatus(404)).toBe(false)
  })
})

describe('isRetryableError', () => {
  it('AbortError（超时）与 TypeError（网络层失败）可重试', () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(isRetryableError(abort)).toBe(true)
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true)
  })

  it('其它错误与非 Error 值不可重试', () => {
    expect(isRetryableError(new RangeError('nope'))).toBe(false)
    expect(isRetryableError('string error')).toBe(false)
    expect(isRetryableError(null)).toBe(false)
    expect(isRetryableError(undefined)).toBe(false)
  })
})

describe('computeDelayMs', () => {
  const opts = { baseDelayMs: 200, maxDelayMs: 5000 }

  it('full jitter：random()=0 → 0；random() 接近 1 → 接近 base', () => {
    // attempt=0 → base = 200 * 2^0 = 200
    expect(computeDelayMs(0, opts, () => 0)).toBe(0)
    expect(computeDelayMs(0, opts, () => 0.5)).toBe(100)
    // attempt=1 → base = 200 * 2^1 = 400
    expect(computeDelayMs(1, opts, () => 0.5)).toBe(200)
    // attempt=2 → base = 200 * 2^2 = 800
    expect(computeDelayMs(2, opts, () => 1)).toBe(800)
  })

  it('指数退避封顶 maxDelayMs', () => {
    // attempt=10 → 200 * 2^10 = 204800，应被裁到 5000
    expect(computeDelayMs(10, opts, () => 1)).toBe(5000)
    expect(computeDelayMs(10, opts, () => 0.5)).toBe(2500)
  })

  it('Retry-After 优先于指数退避与 jitter', () => {
    // 即便 random()=1（退避会取满 base），有 retryAfter 时直接返回 retryAfter
    expect(computeDelayMs(0, opts, () => 1, 1500)).toBe(1500)
    expect(computeDelayMs(5, opts, () => 0.5, 0)).toBe(0)
  })

  it('Retry-After 被 clamp 到 max(maxDelayMs, 30s)，防止超长指令挂起调用方', () => {
    // 默认 maxDelayMs=5000 < 30s：上限取 30s
    expect(computeDelayMs(0, opts, () => 1, 86_400_000)).toBe(30_000)
    expect(computeDelayMs(0, opts, () => 1, 29_000)).toBe(29_000)
    // 调用方主动调大 maxDelayMs 时，上限随之放宽
    const wide = { baseDelayMs: 200, maxDelayMs: 60_000 }
    expect(computeDelayMs(0, wide, () => 1, 86_400_000)).toBe(60_000)
    expect(computeDelayMs(0, wide, () => 1, 45_000)).toBe(45_000)
  })
})

describe('parseRetryAfterMs', () => {
  it('合法秒数 → 毫秒', () => {
    expect(parseRetryAfterMs('0')).toBe(0)
    expect(parseRetryAfterMs('2')).toBe(2000)
    expect(parseRetryAfterMs(' 3 ')).toBe(3000)
  })

  it('缺省 / 空 / 非数字 / 负数 → undefined', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined()
    expect(parseRetryAfterMs('')).toBeUndefined()
    expect(parseRetryAfterMs('   ')).toBeUndefined()
    // HTTP-date 形态本实现刻意不支持
    expect(parseRetryAfterMs('Wed, 21 Oct 2025 07:28:00 GMT')).toBeUndefined()
    expect(parseRetryAfterMs('-5')).toBeUndefined()
    expect(parseRetryAfterMs('NaN')).toBeUndefined()
  })
})
