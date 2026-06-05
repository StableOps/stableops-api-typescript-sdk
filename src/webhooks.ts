import { verifySignature, type VerifyResult } from './signature'

import type { HttpClient } from './http'
import type { CreateWebhookEndpointInput, WebhookEndpoint } from './types'

export class WebhookEndpointsApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpoint> {
    const wire = await this.http.request<WireWebhookEndpoint>({
      method: 'POST',
      path: '/v1/webhook-endpoints',
      body: {
        url: input.url,
        description: input.description,
        enabled_events: input.enabledEvents,
      },
    })
    return fromWire(wire)
  }

  async list(): Promise<WebhookEndpoint[]> {
    const wire = await this.http.request<{ items: WireWebhookEndpoint[] }>({
      method: 'GET',
      path: '/v1/webhook-endpoints',
    })
    return wire.items.map(fromWire)
  }

  async rotateSecret(endpointId: string): Promise<WebhookEndpoint> {
    const wire = await this.http.request<WireWebhookEndpoint>({
      method: 'POST',
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}/rotate-secret`,
    })
    return fromWire(wire)
  }
}

// 不需要 HttpClient，纯本地工具。签名实现内联在 SDK，避免调用方再安装内部包。
export class WebhooksApi {
  verify(input: {
    secret: string | readonly string[]
    header: string | undefined
    rawBody: string
    toleranceSeconds?: number
    now?: number
  }): VerifyResult {
    const secrets = Array.isArray(input.secret)
      ? input.secret
      : [input.secret as string]
    return verifySignature({
      secrets,
      header: input.header,
      rawBody: input.rawBody,
      toleranceSeconds: input.toleranceSeconds,
      now: input.now,
    })
  }
}

type WireWebhookEndpoint = {
  id: string
  url: string
  description: string | null
  enabled_events: string[]
  disabled_at: string | null
  created_at: string
  secret?: string
}

function fromWire(wire: WireWebhookEndpoint): WebhookEndpoint {
  return {
    id: wire.id,
    url: wire.url,
    description: wire.description,
    enabledEvents: wire.enabled_events,
    disabledAt: wire.disabled_at,
    createdAt: wire.created_at,
    secret: wire.secret,
  }
}
