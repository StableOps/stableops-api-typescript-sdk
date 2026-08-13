import type { HttpClient } from './http'
import type {
  CreateWebhookEndpointInput,
  ReplayDeadLettersInput,
  ReplayDeadLettersResult,
  ReplayDeliveryResult,
  UpdateWebhookEndpointInput,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEventType,
} from './types'

export class WebhooksApi {
  constructor(private readonly http: HttpClient) {}

  async createEndpoint(input: CreateWebhookEndpointInput): Promise<WebhookEndpoint> {
    const wire = await this.http.request<WireWebhookEndpoint>({
      method: 'POST',
      path: '/v1/webhook-endpoints',
      body: {
        url: input.url,
        description: input.description,
        enabled_events: input.enabledEvents,
        redact_metadata: input.redactMetadata,
      },
    })
    return fromWire(wire)
  }

  async listEndpoints(params: ListWebhookEndpointsParams = {}): Promise<WebhookEndpoint[]> {
    return (await this.listEndpointsPage(params)).items
  }

  async listEndpointsPage(
    params: ListWebhookEndpointsParams = {},
  ): Promise<WebhookEndpointListPage> {
    const wire = await this.http.request<{
      items: WireWebhookEndpoint[]
      has_more: boolean
      total: number
    }>({
      method: 'GET',
      path: '/v1/webhook-endpoints',
      query: { limit: params.limit, offset: params.offset },
    })
    return {
      items: wire.items.map(fromWire),
      hasMore: wire.has_more,
      total: wire.total,
    }
  }

  async removeEndpoint(endpointId: string): Promise<{ success: boolean }> {
    return this.http.request<{ success: boolean }>({
      method: 'DELETE',
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}`,
    })
  }

  async updateEndpoint(
    endpointId: string,
    input: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpoint> {
    const wire = await this.http.request<WireWebhookEndpoint>({
      method: 'PATCH',
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}`,
      body: {
        description: input.description,
        enabled_events: input.enabledEvents,
        redact_metadata: input.redactMetadata,
      },
    })
    return fromWire(wire)
  }

  async rotateSecret(endpointId: string): Promise<WebhookEndpoint> {
    const wire = await this.http.request<WireWebhookEndpoint>({
      method: 'POST',
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}/rotate-secret`,
    })
    return fromWire(wire)
  }

  async replay(endpointId: string, eventId: string): Promise<ReplayDeliveryResult> {
    return this.http.request<ReplayDeliveryResult>({
      method: 'POST',
      path: `/v1/webhook-endpoints/${encodeURIComponent(endpointId)}/replay`,
      body: { event_id: eventId },
    })
  }

  async listDeliveries(
    params: ListWebhookDeliveriesParams = {},
  ): Promise<WebhookDelivery[]> {
    return (await this.listDeliveriesPage(params)).items
  }

  async listDeliveriesPage(
    params: ListWebhookDeliveriesParams = {},
  ): Promise<WebhookDeliveryListPage> {
    const wire = await this.http.request<{
      items: WireWebhookDelivery[]
      has_more: boolean
      total: number
    }>({
      method: 'GET',
      path: '/v1/webhook-deliveries',
      query: {
        status: params.status,
        endpoint_id: params.endpointId,
        payment_order_id: params.paymentOrderId,
        limit: params.limit,
        offset: params.offset,
      },
    })
    return {
      items: wire.items.map(fromWireDelivery),
      hasMore: wire.has_more,
      total: wire.total,
    }
  }

  async replayDelivery(deliveryId: string): Promise<ReplayDeliveryResult> {
    return this.http.request<ReplayDeliveryResult>({
      method: 'POST',
      path: `/v1/webhook-deliveries/${encodeURIComponent(deliveryId)}/replay`,
    })
  }

  async replayDeadLetters(input: ReplayDeadLettersInput = {}): Promise<ReplayDeadLettersResult> {
    const wire = await this.http.request<WireReplayDeadLettersResult>({
      method: 'POST',
      path: '/v1/webhook-deliveries/replay-dead-letters',
      body: {
        endpoint_id: input.endpointId,
        limit: input.limit,
      },
    })
    return {
      replayed: wire.replayed,
      items: wire.items.map((item) => ({
        originalId: item.original_id,
        deliveryId: item.delivery_id,
      })),
    }
  }
}

export type ListWebhookEndpointsParams = { limit?: number; offset?: number }

export type WebhookEndpointListPage = {
  items: WebhookEndpoint[]
  hasMore: boolean
  total: number
}

export type ListWebhookDeliveriesParams = {
  status?: WebhookDeliveryStatus
  endpointId?: string
  paymentOrderId?: string
  limit?: number
  offset?: number
}

export type WebhookDeliveryListPage = {
  items: WebhookDelivery[]
  hasMore: boolean
  total: number
}

type WireWebhookEndpoint = {
  id: string
  url: string
  description: string | null
  enabled_events: WebhookEventType[]
  redact_metadata: boolean
  disabled_at: string | null
  created_at: string
  secret?: string
}

type WireWebhookDelivery = {
  id: string
  webhook_endpoint_id: string
  event_id: string
  event_type: WebhookEventType
  payment_order_id: string | null
  status: WebhookDeliveryStatus
  attempts: number
  response_status: number | null
  response_duration_ms: number | null
  error_message: string | null
  next_retry_at: string | null
  last_attempt_at: string | null
  succeeded_at: string | null
  dead_lettered_at: string | null
  created_at: string
  payload: Record<string, unknown>
}

type WireReplayDeadLettersResult = {
  replayed: number
  items: { original_id: string; delivery_id: string }[]
}

function fromWire(wire: WireWebhookEndpoint): WebhookEndpoint {
  const endpoint: WebhookEndpoint = {
    id: wire.id,
    url: wire.url,
    description: wire.description,
    enabledEvents: wire.enabled_events,
    redactMetadata: wire.redact_metadata,
    disabledAt: wire.disabled_at,
    createdAt: wire.created_at,
  }
  if (wire.secret !== undefined) endpoint.secret = wire.secret
  return endpoint
}

function fromWireDelivery(wire: WireWebhookDelivery): WebhookDelivery {
  return {
    id: wire.id,
    webhookEndpointId: wire.webhook_endpoint_id,
    eventId: wire.event_id,
    eventType: wire.event_type,
    paymentOrderId: wire.payment_order_id,
    status: wire.status,
    attempts: wire.attempts,
    responseStatus: wire.response_status,
    responseDurationMs: wire.response_duration_ms,
    errorMessage: wire.error_message,
    nextRetryAt: wire.next_retry_at,
    lastAttemptAt: wire.last_attempt_at,
    succeededAt: wire.succeeded_at,
    deadLetteredAt: wire.dead_lettered_at,
    createdAt: wire.created_at,
    payload: wire.payload,
  }
}
