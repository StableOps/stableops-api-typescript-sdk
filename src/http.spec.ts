import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { HttpClient, StableOpsError, maskSecret, type ClientOptions, type DebugEvent } from './http'

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
        () =>
          HttpResponse.json(
            { code: 'rate_limited' },
            { status: 429, headers: { 'retry-after': '0' } },
          ),
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

describe('HttpClient — debug 钩子', () => {
  it('maskSecret：短串整段替换，长串保留首尾各 4', () => {
    expect(maskSecret(undefined)).toBeUndefined()
    expect(maskSecret('abcd1234')).toBe('***')
    expect(maskSecret('sk_live_abcdef1234567890')).toBe('sk_l***7890')
  })

  it('init / request / response 三段事件 + apiKey 与 authorization 均被脱敏', async () => {
    server.use(http.get(PING, () => HttpResponse.json({ ok: true })))
    const events: DebugEvent[] = []
    const client = new HttpClient({
      baseUrl: BASE_URL,
      apiKey: 'sk_live_abcdef1234567890',
      debug: (e) => events.push(e),
      _sleep: async () => {},
      _now: () => 1_700_000_000_000,
    })

    await client.request({ method: 'GET', path: '/v1/ping' })

    expect(events[0]).toEqual({
      type: 'init',
      config: expect.objectContaining({
        baseUrl: BASE_URL,
        apiKey: 'sk_l***7890',
        timeoutMs: 30_000,
        maxRetries: 2,
        fetch: 'global',
      }),
    })

    const req = events[1]
    expect(req.type).toBe('request')
    if (req.type !== 'request') throw new Error('unreachable')
    expect(req.headers.authorization).toBe('Bearer sk_l***7890')
    expect(req.url).toBe(`${BASE_URL}/v1/ping`)
    expect(req.attempt).toBe(0)

    const res = events[2]
    expect(res.type).toBe('response')
    if (res.type !== 'response') throw new Error('unreachable')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(res.durationMs).toBe(0)
  })

  it('error 事件在网络失败时触发，每次重试一条', async () => {
    server.use(
      http.get(PING, () => HttpResponse.error(), { once: true }),
      http.get(PING, () => HttpResponse.json({ ok: true })),
    )
    const events: DebugEvent[] = []
    const client = new HttpClient({
      baseUrl: BASE_URL,
      debug: (e) => events.push(e),
      _sleep: async () => {},
      _random: () => 0.5,
    })
    await client.request({ method: 'GET', path: '/v1/ping' })
    const errs = events.filter((e) => e.type === 'error')
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatchObject({ type: 'error', attempt: 0 })
  })

  it('idempotency-key 在 debug 日志里被脱敏', async () => {
    server.use(http.post(ORDERS, () => HttpResponse.json({ ok: true })))
    const events: DebugEvent[] = []
    const client = new HttpClient({
      baseUrl: BASE_URL,
      debug: (e) => events.push(e),
      _sleep: async () => {},
    })
    await client.request({
      method: 'POST',
      path: '/v1/payment-orders',
      body: {},
      idempotencyKey: 'idem-abcdef-123456-XYZ',
    })
    const req = events.find((e) => e.type === 'request')
    if (!req || req.type !== 'request') throw new Error('expected request event')
    expect(req.headers['idempotency-key']).toBe('idem***-XYZ')
  })

  it('响应 headers 与请求 / 响应 body 中的敏感字段均被脱敏', async () => {
    // 用 fake fetch 构造带敏感 header + 敏感 body 字段的响应，避免依赖 msw 对 header 的透传细节。
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          secret: 'whsec_abcdef123456',
          portal_token: 'pt_1234567890abcdef',
          nested: { client_secret: 'cs_test_1234567890abc' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', cookie: 'sess=abcdef123456789' },
        },
      )
    const events: DebugEvent[] = []
    const client = new HttpClient({
      baseUrl: BASE_URL,
      fetch: fakeFetch,
      debug: (e) => events.push(e),
      _sleep: async () => {},
    })

    await client.request({
      method: 'POST',
      path: '/v1/anything',
      body: { note: 'x', clientSecret: 'cs_live_9876543210zyxw' },
    })

    const req = events.find((e) => e.type === 'request')
    if (!req || req.type !== 'request') throw new Error('expected request event')
    expect(req.body).toEqual({ note: 'x', clientSecret: 'cs_l***zyxw' })

    const res = events.find((e) => e.type === 'response')
    if (!res || res.type !== 'response') throw new Error('expected response event')
    expect(res.headers.cookie).toBe('sess***6789')
    expect(res.body).toEqual({
      ok: true,
      secret: 'whse***3456',
      portal_token: 'pt_1***cdef',
      nested: { client_secret: 'cs_t***0abc' },
    })
  })
})

describe('HttpClient — idempotency key 生成回退', () => {
  it('crypto.randomUUID 缺失（浏览器非安全上下文）时用 getRandomValues 拼 UUID v4', async () => {
    let key: string | undefined
    const fakeFetch: typeof fetch = async (_input, init) => {
      const h = init?.headers as Record<string, string> | undefined
      key = h?.['idempotency-key']
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    // 只提供 getRandomValues 的 crypto —— 模拟非安全上下文；确定性字节便于精确断言。
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xab)
        return arr
      },
    })
    try {
      const client = new HttpClient({ baseUrl: BASE_URL, fetch: fakeFetch })
      await client.request({ method: 'POST', path: '/v1/anything', body: {} })
    } finally {
      vi.unstubAllGlobals()
    }
    // 0xab 填充 + version/variant 位修正后的确定性结果；同时符合 UUID v4 形态。
    expect(key).toBe('abababab-abab-4bab-abab-abababababab')
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  })
})

describe('HttpClient — body 序列化失败', () => {
  it('循环引用 body 包装为 StableOpsError code=serialization_error，不发出请求', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    let fetchCalls = 0
    const fakeFetch: typeof fetch = async () => {
      fetchCalls++
      return new Response('{}', { status: 200 })
    }
    const client = new HttpClient({ baseUrl: BASE_URL, fetch: fakeFetch })
    const err = await rejection(
      client.request({ method: 'POST', path: '/v1/anything', body: circular }),
    )
    expect(err).toBeInstanceOf(StableOpsError)
    expect(err.status).toBe(0)
    expect(err.code).toBe('serialization_error')
    expect(fetchCalls).toBe(0)
  })
})

describe('HttpClient.request — 幂等键', () => {
  it('普通 POST 遇到 500 不自动重试', async () => {
    let hits = 0
    server.use(
      http.post(ORDERS, () => {
        hits++
        return HttpResponse.json({ code: 'server_error' }, { status: 500 })
      }),
    )

    const err = await rejection(
      makeClient().request({
        method: 'POST',
        path: '/v1/payment-orders',
        body: { amount: '1' },
      }),
    )

    expect(err.status).toBe(500)
    expect(hits).toBe(1)
  })

  it('显式可重试 POST 在 500 → 200 时复用同一个 idempotency-key', async () => {
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
      retryable: true,
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

describe('HttpClient — user-agent 仅在非浏览器环境发送', () => {
  // Safari 严格执行 fetch 规范：把 user-agent 列为 forbidden header，并把 SDK 设置的值放进
  // CORS 预检的 Access-Control-Request-Headers，后端没声明就 403。浏览器自己会带 UA，无需 SDK 设。
  it('Node 环境(默认)发送 StableOpsSDK user-agent', async () => {
    let ua: string | null = null
    server.use(
      http.get(PING, ({ request }) => {
        ua = request.headers.get('user-agent')
        return HttpResponse.json({ ok: true })
      }),
    )
    await makeClient().request({ method: 'GET', path: '/v1/ping' })
    expect(ua).toMatch(/^StableOpsSDK\//u)
  })

  it('存在 document(浏览器) 时不写入 user-agent header', async () => {
    let uaSetBySdk: string | undefined
    // 用 fake fetch 直接观察 SDK 实际下发的 headers —— msw 在 Node 里对 forbidden header
    // 的处理不能精确模拟浏览器，所以这里直接拦截 fetch 看 init.headers。
    const fakeFetch: typeof fetch = async (_input, init) => {
      const h = init?.headers as Record<string, string> | undefined
      uaSetBySdk = h?.['user-agent']
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    // 在 Vitest 的 node 环境里 stub 一个最小 document，让 typeof document !== 'undefined' 成立。
    const g = globalThis as { document?: unknown }
    const hadDocument = 'document' in g
    const prev = g.document
    g.document = {}
    try {
      const client = makeClient({ fetch: fakeFetch })
      await client.request({ method: 'GET', path: '/v1/ping' })
      expect(uaSetBySdk).toBeUndefined()
    } finally {
      if (hadDocument) g.document = prev
      else delete g.document
    }
  })
})
