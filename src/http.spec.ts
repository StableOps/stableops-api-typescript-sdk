import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpClient, StableOpsError, type ClientOptions } from './http'

const BASE_URL = 'https://api.test.local'
const PING = `${BASE_URL}/v1/ping`
const ORDERS = `${BASE_URL}/v1/payment-orders`

// 无默认 handler，逐用例用 server.use() 注入；未匹配请求直接报错，暴露测试编排失误。
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// 默认注入确定性桩：_sleep 不真等、_random 固定 → 全套秒级且不 flaky。
function makeClient(options: Partial<ClientOptions> = {}): HttpClient {
  return new HttpClient({
    baseUrl: BASE_URL,
    _sleep: async () => {},
    _random: () => 0.5,
    ...options,
  })
}

// 取回 reject 的错误对象用于断言（StableOpsError 的 status/code/details 为自有属性）。
async function rejection(promise: Promise<unknown>): Promise<StableOpsError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof StableOpsError) return err
    throw err
  }
  throw new Error('expected request to reject, but it resolved')
}

describe('HttpClient.request — 4xx 立即抛出，不重试', () => {
  it('401 抛 status=401 且 handler 仅命中 1 次', async () => {
    let hits = 0
    server.use(
      http.get(PING, () => {
        hits++
        return HttpResponse.json({ code: 'unauthorized', message: 'bad key' }, { status: 401 })
      }),
    )
    const err = await rejection(makeClient().request({ method: 'GET', path: '/v1/ping' }))
    expect(err.status).toBe(401)
    expect(err.code).toBe('unauthorized')
    expect(hits).toBe(1)
  })

  it('409 幂等冲突抛 status=409，不重试', async () => {
    let hits = 0
    server.use(
      http.post(ORDERS, () => {
        hits++
        return HttpResponse.json({ code: 'idempotency_conflict' }, { status: 409 })
      }),
    )
    const err = await rejection(
      makeClient().request({ method: 'POST', path: '/v1/payment-orders', body: {} }),
    )
    expect(err.status).toBe(409)
    expect(hits).toBe(1)
  })

  it('400 校验错误，details 携带后端 body', async () => {
    server.use(
      http.post(ORDERS, () =>
        HttpResponse.json(
          { code: 'validation_error', message: 'amount required', fields: ['amount'] },
          { status: 400 },
        ),
      ),
    )
    const err = await rejection(
      makeClient().request({ method: 'POST', path: '/v1/payment-orders', body: {} }),
    )
    expect(err.status).toBe(400)
    expect(err.code).toBe('validation_error')
    expect(err.details).toMatchObject({ fields: ['amount'] })
  })
})

describe('HttpClient.request — 5xx / 429 重试', () => {
  it('500 持续：重试耗尽后抛 status=500，命中 maxRetries+1 次', async () => {
    let hits = 0
    server.use(
      http.get(PING, () => {
        hits++
        return HttpResponse.json({ code: 'server_error' }, { status: 500 })
      }),
    )
    const err = await rejection(
      makeClient({ retry: { maxRetries: 2 } }).request({ method: 'GET', path: '/v1/ping' }),
    )
    expect(err.status).toBe(500)
    expect(hits).toBe(3)
  })

  it('500 → 500 → 200：最终成功返回解析后数据', async () => {
    server.use(
      http.get(PING, () => HttpResponse.json({ code: 'x' }, { status: 500 }), { once: true }),
      http.get(PING, () => HttpResponse.json({ code: 'x' }, { status: 500 }), { once: true }),
      http.get(PING, () => HttpResponse.json({ ok: true })),
    )
    const data = await makeClient({ retry: { maxRetries: 2 } }).request({
      method: 'GET',
      path: '/v1/ping',
    })
    expect(data).toEqual({ ok: true })
  })

  it('429 带 Retry-After: 0：遵守 Retry-After（延迟 0，而非 jitter 退避）后成功', async () => {
    server.use(
      http.get(
        PING,
        () => HttpResponse.json({ code: 'rate_limited' }, { status: 429, headers: { 'retry-after': '0' } }),
        { once: true },
      ),
      http.get(PING, () => HttpResponse.json({ ok: true })),
    )
    const sleeps: number[] = []
    // _random=0.5 时，若走 jitter 退避 attempt=0 应等 100ms；实际等 0 证明 Retry-After 优先。
    const client = makeClient({ _sleep: async (ms) => void sleeps.push(ms) })
    const data = await client.request({ method: 'GET', path: '/v1/ping' })
    expect(data).toEqual({ ok: true })
    expect(sleeps).toEqual([0])
  })
})

describe('HttpClient.request — 网络错误统一包装', () => {
  it('网络错误持续：抛 StableOpsError code=network_error，status=0', async () => {
    server.use(http.get(PING, () => HttpResponse.error()))
    const err = await rejection(makeClient().request({ method: 'GET', path: '/v1/ping' }))
    expect(err).toBeInstanceOf(StableOpsError)
    expect(err.status).toBe(0)
    expect(err.code).toBe('network_error')
  })

  it('网络错误 → 成功：重试后返回数据', async () => {
    server.use(
      http.get(PING, () => HttpResponse.error(), { once: true }),
      http.get(PING, () => HttpResponse.json({ ok: true })),
    )
    const data = await makeClient().request({ method: 'GET', path: '/v1/ping' })
    expect(data).toEqual({ ok: true })
  })
})

describe('HttpClient.request — 超时（AbortController）', () => {
  // 注入「永不自然 resolve、仅在 abort 时 reject(AbortError)」的 fetch，配合小 timeoutMs
  // 确定性触发超时，避免依赖 MSW delay 与 abort 信号的交互细节，保证不 flaky。
  function hangingFetch(): typeof fetch {
    return (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
  }

  it('超时耗尽：抛 code=timeout，status=0', async () => {
    const client = new HttpClient({
      baseUrl: BASE_URL,
      fetch: hangingFetch(),
      timeoutMs: 20,
      retry: { maxRetries: 0 },
    })
    const err = await rejection(client.request({ method: 'GET', path: '/v1/ping' }))
    expect(err).toBeInstanceOf(StableOpsError)
    expect(err.status).toBe(0)
    expect(err.code).toBe('timeout')
  })

  it('超时可重试：首次超时 → 重试成功', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = (_input, init) => {
      calls++
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }
    const client = new HttpClient({
      baseUrl: BASE_URL,
      fetch: fetchImpl,
      timeoutMs: 20,
      retry: { maxRetries: 1 },
      _sleep: async () => {},
    })
    const data = await client.request({ method: 'GET', path: '/v1/ping' })
    expect(data).toEqual({ ok: true })
    expect(calls).toBe(2)
  })
})

describe('HttpClient.request — 幂等键', () => {
  it('写请求 500 → 200：两次尝试复用同一个 idempotency-key（核心安全断言）', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.post(
        ORDERS,
        ({ request }) => {
          keys.push(request.headers.get('idempotency-key'))
          return HttpResponse.json({ code: 'x' }, { status: 500 })
        },
        { once: true },
      ),
      http.post(ORDERS, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'))
        return HttpResponse.json({ ok: true })
      }),
    )
    const data = await makeClient().request({
      method: 'POST',
      path: '/v1/payment-orders',
      body: { amount: '1' },
    })
    expect(data).toEqual({ ok: true })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })

  it('GET 不自动补幂等键', async () => {
    let key: string | null = 'unset'
    server.use(
      http.get(PING, ({ request }) => {
        key = request.headers.get('idempotency-key')
        return HttpResponse.json({ ok: true })
      }),
    )
    await makeClient().request({ method: 'GET', path: '/v1/ping' })
    expect(key).toBeNull()
  })

  it('调用方显式提供的幂等键被原样使用', async () => {
    let key: string | null = null
    server.use(
      http.post(ORDERS, ({ request }) => {
        key = request.headers.get('idempotency-key')
        return HttpResponse.json({ ok: true })
      }),
    )
    await makeClient().request({
      method: 'POST',
      path: '/v1/payment-orders',
      body: {},
      idempotencyKey: 'caller-supplied-key',
    })
    expect(key).toBe('caller-supplied-key')
  })
})
