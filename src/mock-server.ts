import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'

import { buildSignatureHeader } from './signature'

// 极简内存版 mock，用于 SDK 集成测试与本地 docs 示例。
// 仅模拟 v1/payment-orders 创建/查询/取消、v1/events 列表、v1/webhook-endpoints CRUD，
// 以及签名 fixture 构造。生产环境的 NestJS 服务才是参考实现，这里只做开发体感。

export type MockServerOptions = {
  port?: number
  host?: string
  // 测试时常希望注入固定 id 生成器，便于断言。
  idFactory?: () => string
  // 与资源 id 分离，避免固定 id 时所有轮换都得到同一个 secret。
  secretFactory?: () => string
}

type PaymentOrder = {
  id: string
  merchant_order_id: string
  scenario: string
  amount: string
  settlement_asset: string
  status:
    | 'created'
    | 'detected'
    | 'confirmed'
    | 'finalized'
    | 'reverted'
    | 'expired'
    | 'canceled'
  expires_at: string | null
  metadata: unknown
  created_at: string
  accepted_assets: { chain: string; asset: string }[]
  payment_instructions: { chain: string; asset: string; address: string }[]
  timeline: { from: string | null; to: string; reason: string | null; at: string }[]
}

type WebhookEndpoint = {
  id: string
  url: string
  description: string | null
  enabled_events: string[]
  redact_metadata: boolean
  disabled_at: string | null
  created_at: string
  secret: string
}

export class MockServer {
  private readonly server: Server
  private readonly orders = new Map<string, PaymentOrder>()
  private readonly endpoints = new Map<string, WebhookEndpoint>()
  private readonly idempotency = new Map<string, PaymentOrder>()
  private readonly idFactory: () => string
  private readonly secretFactory: () => string

  constructor(private readonly options: MockServerOptions = {}) {
    this.idFactory = options.idFactory ?? (() => randomUUID())
    this.secretFactory = options.secretFactory ?? (() => randomUUID())
    this.server = createServer((req, res) => this.handle(req, res))
  }

  listen(): Promise<{ url: string }> {
    return new Promise((resolve) => {
      this.server.listen(this.options.port ?? 0, this.options.host ?? '127.0.0.1', () => {
        const address = this.server.address()
        if (typeof address === 'string' || address === null) {
          resolve({ url: `http://${this.options.host ?? '127.0.0.1'}:${this.options.port ?? 0}` })
          return
        }
        resolve({ url: `http://${address.address}:${address.port}` })
      })
    })
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  // 暴露用于断言的内部状态。
  snapshot() {
    return {
      orders: Array.from(this.orders.values()),
      endpoints: Array.from(this.endpoints.values()),
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const body = await readBody(req)
    res.setHeader('content-type', 'application/json')

    try {
      if (req.method === 'POST' && url.pathname === '/v1/payment-orders') {
        return this.createOrder(req, body, res)
      }
      if (req.method === 'GET' && url.pathname === '/v1/payment-orders') {
        return json(res, 200, { items: Array.from(this.orders.values()) })
      }
      const orderMatch = url.pathname.match(/^\/v1\/payment-orders\/([^/]+)$/u)
      if (req.method === 'GET' && orderMatch) {
        const order = this.orders.get(orderMatch[1])
        return order ? json(res, 200, order) : json(res, 404, { code: 'not_found' })
      }
      const cancelMatch = url.pathname.match(/^\/v1\/payment-orders\/([^/]+)\/cancel$/u)
      if (req.method === 'POST' && cancelMatch) {
        return this.cancelOrder(cancelMatch[1], res)
      }
      if (req.method === 'GET' && url.pathname === '/v1/events') {
        return json(res, 200, { items: [] })
      }

      if (req.method === 'POST' && url.pathname === '/v1/webhook-endpoints') {
        return this.createEndpoint(body, res)
      }
      if (req.method === 'GET' && url.pathname === '/v1/webhook-endpoints') {
        return json(res, 200, {
          items: Array.from(this.endpoints.values(), (endpoint) =>
            webhookEndpointResponse(endpoint),
          ),
        })
      }
      const endpointMatch = url.pathname.match(/^\/v1\/webhook-endpoints\/([^/]+)$/u)
      if (req.method === 'PATCH' && endpointMatch) {
        return this.updateEndpoint(endpointMatch[1], body, res)
      }
      const rotateMatch = url.pathname.match(
        /^\/v1\/webhook-endpoints\/([^/]+)\/rotate-secret$/u,
      )
      if (req.method === 'POST' && rotateMatch) {
        return this.rotateEndpointSecret(rotateMatch[1], res)
      }

      json(res, 404, { code: 'not_found' })
    } catch (err) {
      json(res, 500, { code: 'internal', message: String(err) })
    }
  }

  private createOrder(req: IncomingMessage, body: unknown, res: ServerResponse) {
    const idem = headerValue(req, 'idempotency-key')
    if (idem && this.idempotency.has(idem)) {
      const previous = this.idempotency.get(idem)!
      return json(res, 201, previous)
    }
    const input = body as Record<string, unknown>
    const id = this.idFactory()
    const accepted = (input.accepted_assets as { chain: string; asset: string }[]) ?? []
    const order: PaymentOrder = {
      id,
      merchant_order_id: String(input.merchant_order_id ?? ''),
      scenario: String(input.scenario ?? 'generic'),
      amount: String(input.amount ?? '0'),
      settlement_asset: String(input.settlement_asset ?? 'USDC'),
      status: 'created',
      expires_at: (input.expires_at as string | undefined) ?? null,
      metadata: input.metadata ?? null,
      created_at: new Date().toISOString(),
      accepted_assets: accepted,
      payment_instructions:
        accepted.length > 0
          ? accepted.map((entry, index) => ({
              chain: entry.chain,
              asset: entry.asset,
              address: `0xMOCK${id.slice(0, 8)}${index}`,
            }))
          : [{ chain: 'base', asset: 'USDC', address: `0xMOCK${id.slice(0, 8)}0` }],
      timeline: [
        { from: null, to: 'created', reason: 'order_created', at: new Date().toISOString() },
      ],
    }
    this.orders.set(id, order)
    if (idem) this.idempotency.set(idem, order)
    json(res, 201, order)
  }

  private cancelOrder(id: string, res: ServerResponse) {
    const order = this.orders.get(id)
    if (!order) return json(res, 404, { code: 'not_found' })
    order.status = 'canceled'
    order.timeline.push({
      from: order.timeline[order.timeline.length - 1]?.to ?? 'created',
      to: 'canceled',
      reason: 'manual_cancel',
      at: new Date().toISOString(),
    })
    json(res, 200, order)
  }

  private createEndpoint(body: unknown, res: ServerResponse) {
    const input = body as Record<string, unknown>
    const id = this.idFactory()
    const secret = `whsec_mock_${this.secretFactory().slice(0, 12)}`
    const endpoint: WebhookEndpoint = {
      id,
      url: String(input.url ?? ''),
      description: (input.description as string | null) ?? null,
      enabled_events: (input.enabled_events as string[]) ?? [],
      redact_metadata: (input.redact_metadata as boolean | undefined) ?? false,
      disabled_at: null,
      created_at: new Date().toISOString(),
      secret,
    }
    this.endpoints.set(id, endpoint)
    json(res, 201, webhookEndpointResponse(endpoint, true))
  }

  private updateEndpoint(id: string, body: unknown, res: ServerResponse) {
    const endpoint = this.endpoints.get(id)
    if (!endpoint) return json(res, 404, { code: 'not_found' })
    const input = body as Record<string, unknown>
    if ('description' in input) {
      endpoint.description = (input.description as string | null) ?? null
    }
    if ('enabled_events' in input) {
      endpoint.enabled_events = input.enabled_events as string[]
    }
    if ('redact_metadata' in input) {
      endpoint.redact_metadata = input.redact_metadata as boolean
    }
    json(res, 200, webhookEndpointResponse(endpoint))
  }

  private rotateEndpointSecret(id: string, res: ServerResponse) {
    const endpoint = this.endpoints.get(id)
    if (!endpoint) return json(res, 404, { code: 'not_found' })
    endpoint.secret = `whsec_mock_${this.secretFactory().slice(0, 12)}`
    json(res, 200, webhookEndpointResponse(endpoint, true))
  }

  // 暴露给测试：触发一次签名后的“delivery”，便于 webhook verifier 端到端测试。
  buildSignedFixture(endpointId: string, eventType: string, payload: unknown) {
    const endpoint = this.endpoints.get(endpointId)
    if (!endpoint) throw new Error('endpoint not found')
    const rawBody = JSON.stringify({ type: eventType, data: payload })
    const timestamp = Math.floor(Date.now() / 1000)
    return {
      header: buildSignatureHeader({ secret: endpoint.secret, timestamp, rawBody }),
      rawBody,
      secret: endpoint.secret,
    }
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return null
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.end(JSON.stringify(body))
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name]
  if (Array.isArray(raw)) return raw[0]
  return raw
}

function webhookEndpointResponse(
  endpoint: WebhookEndpoint,
  includeSecret = false,
): Omit<WebhookEndpoint, 'secret'> & { secret?: string } {
  const { secret, ...response } = endpoint
  return includeSecret ? { ...response, secret } : response
}
