import type { HttpClient } from './http'
import type {
  AcceptedAssetInput,
  Asset,
  ChainId,
  CheckoutSession,
  CreatePaymentOrderInput,
  CreateCheckoutSessionInput,
  NormalizedEvent,
  NormalizedEventDetail,
  PaymentOrder,
  PaymentOrderDetail,
  PaymentOrderStatus,
} from './types'

export class PaymentOrdersApi {
  constructor(private readonly http: HttpClient) {}

  async create(
    input: CreatePaymentOrderInput,
    options: { idempotencyKey: string },
  ): Promise<PaymentOrder> {
    const wire = await this.http.request<WirePaymentOrder>({
      method: 'POST',
      path: '/v1/payment-orders',
      idempotencyKey: options.idempotencyKey,
      retryable: true,
      body: toCreateWire(input),
    })
    return fromWire(wire)
  }

  async retrieve(id: string): Promise<PaymentOrderDetail> {
    const wire = await this.http.request<WirePaymentOrderDetail>({
      method: 'GET',
      path: `/v1/payment-orders/${encodeURIComponent(id)}`,
    })
    return fromWireDetail(wire)
  }

  async list(
    params: { status?: PaymentOrderStatus; limit?: number } = {},
  ): Promise<PaymentOrder[]> {
    const wire = await this.http.request<{ items: WirePaymentOrder[] }>({
      method: 'GET',
      path: '/v1/payment-orders',
      query: { status: params.status, limit: params.limit },
    })
    return wire.items.map(fromWire)
  }

  async cancel(id: string): Promise<PaymentOrder> {
    const wire = await this.http.request<WirePaymentOrder>({
      method: 'POST',
      path: `/v1/payment-orders/${encodeURIComponent(id)}/cancel`,
    })
    return fromWire(wire)
  }
}

export type CheckoutSessionsApiOptions = {
  checkoutBaseUrl?: string
}

export class CheckoutSessionsApi {
  private readonly checkoutBaseUrl: string

  constructor(
    private readonly http: HttpClient,
    options: CheckoutSessionsApiOptions = {},
  ) {
    this.checkoutBaseUrl = (
      options.checkoutBaseUrl ?? 'https://pay.stableops.dev'
    ).replace(/\/+$/u, '')
  }

  async create(
    input: CreateCheckoutSessionInput,
    options: { idempotencyKey: string },
  ): Promise<CheckoutSession> {
    const wire = await this.http.request<WireCheckoutSession>({
      method: 'POST',
      path: '/v1/checkout-sessions',
      idempotencyKey: options.idempotencyKey,
      retryable: true,
      body: toCreateCheckoutWire(input),
    })
    return fromCheckoutWire(wire, this.checkoutBaseUrl)
  }
}

export class EventsApi {
  constructor(private readonly http: HttpClient) {}

  async list(
    params: {
      chain?: ChainId
      asset?: Asset
      paymentOrderId?: string
      limit?: number
      toAddress?: string
      txHash?: string
    } = {},
  ): Promise<NormalizedEvent[]> {
    const wire = await this.http.request<{ items: WireNormalizedEvent[] }>({
      method: 'GET',
      path: '/v1/events',
      query: {
        chain: params.chain,
        asset: params.asset,
        payment_order_id: params.paymentOrderId,
        limit: params.limit,
        to_address: params.toAddress,
        tx_hash: params.txHash,
      },
    })
    return wire.items.map(fromWireEvent)
  }

  async retrieve(id: string): Promise<NormalizedEventDetail> {
    const wire = await this.http.request<WireNormalizedEventDetail>({
      method: 'GET',
      path: `/v1/events/${encodeURIComponent(id)}`,
    })
    return fromWireEventDetail(wire)
  }
}

// ---- 内部 wire 类型，避免 SDK 公开蛇形命名 ----

type WirePaymentOrder = {
  id: string
  merchant_order_id: string
  amount: string
  requested_amount: string
  settlement_asset?: string
  status: string
  expires_at: string | null
  metadata: unknown
  created_at: string
  accepted_assets?: { chain: string; asset: string }[]
  payment_instructions: { chain: string; asset: string; address: string }[]
}

type WirePaymentOrderDetail = WirePaymentOrder & {
  timeline: { from: string | null; to: string; reason: string | null; at: string }[]
}

type WireCheckoutSession = {
  id: string
  client_secret?: string
  status: string
  title: string | null
  description: string | null
  success_url: string | null
  cancel_url: string | null
  expires_at: string | null
  created_at: string
  payment_order: WirePaymentOrder
}

type WireNormalizedEvent = {
  id: string
  chain: string
  asset: string
  from_address: string
  to_address: string
  amount: string
  tx_hash: string
  log_index: number
  block_number: string
  payment_order_id: string | null
  confirmations: number
  detected_at: string
}

type WireNormalizedEventDetail = WireNormalizedEvent & {
  raw_chain_event: {
    id: string
    source: string
    block_hash: string | null
    received_at: string
    payload: unknown
  }
  payment_order: {
    id: string
    merchant_order_id: string
    status: string
    settlement_asset?: string
    amount: string
  } | null
  deliveries: {
    id: string
    webhook_endpoint_id: string
    event_type: string
    status: string
    attempts: number
    response_status: number | null
    error_message: string | null
    last_attempt_at: string | null
    created_at: string
  }[]
}

function toCreateWire(input: CreatePaymentOrderInput) {
  return {
    merchant_order_id: input.merchantOrderId,
    amount: input.amount,
    amount_mode: input.amountMode,
    accepted_assets: input.acceptedAssets.map((entry) => ({
      chain: entry.chain,
      asset: entry.asset,
    })),
    expires_at: input.expiresAt,
    metadata: input.metadata,
  }
}

function toCreateCheckoutWire(input: CreateCheckoutSessionInput) {
  return {
    ...toCreateWire(input),
    title: input.title,
    description: input.description,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }
}

function fromWire(wire: WirePaymentOrder): PaymentOrder {
  return {
    id: wire.id,
    merchantOrderId: wire.merchant_order_id,
    amount: wire.amount,
    requestedAmount: wire.requested_amount,
    settlementAsset: wire.settlement_asset as PaymentOrder['settlementAsset'],
    status: wire.status as PaymentOrder['status'],
    expiresAt: wire.expires_at,
    metadata: wire.metadata,
    createdAt: wire.created_at,
    acceptedAssets: wire.accepted_assets?.map((entry) => ({
      chain: entry.chain as AcceptedAssetInput['chain'],
      asset: entry.asset as AcceptedAssetInput['asset'],
    })),
    paymentInstructions: wire.payment_instructions.map((instruction) => ({
      chain: instruction.chain as PaymentOrderInstructionChain,
      asset: instruction.asset as PaymentOrderInstructionAsset,
      address: instruction.address,
    })),
  }
}

type PaymentOrderInstructionChain = PaymentOrder['paymentInstructions'][number]['chain']
type PaymentOrderInstructionAsset = PaymentOrder['paymentInstructions'][number]['asset']

function fromWireDetail(wire: WirePaymentOrderDetail): PaymentOrderDetail {
  return {
    ...fromWire(wire),
    timeline: wire.timeline.map((entry) => ({
      from: entry.from as PaymentOrderDetail['timeline'][number]['from'],
      to: entry.to as PaymentOrderDetail['timeline'][number]['to'],
      reason: entry.reason,
      at: entry.at,
    })),
  }
}

function fromCheckoutWire(
  wire: WireCheckoutSession,
  checkoutBaseUrl: string,
): CheckoutSession {
  return {
    id: wire.id,
    clientSecret: wire.client_secret,
    url: wire.client_secret
      ? `${checkoutBaseUrl}/c/${encodeURIComponent(wire.id)}?client_secret=${encodeURIComponent(wire.client_secret)}`
      : undefined,
    status: wire.status as CheckoutSession['status'],
    title: wire.title,
    description: wire.description,
    successUrl: wire.success_url,
    cancelUrl: wire.cancel_url,
    expiresAt: wire.expires_at,
    createdAt: wire.created_at,
    paymentOrder: fromWire(wire.payment_order),
  }
}

function fromWireEvent(wire: WireNormalizedEvent): NormalizedEvent {
  return {
    id: wire.id,
    chain: wire.chain as NormalizedEvent['chain'],
    asset: wire.asset as NormalizedEvent['asset'],
    fromAddress: wire.from_address,
    toAddress: wire.to_address,
    amount: wire.amount,
    txHash: wire.tx_hash,
    logIndex: wire.log_index,
    blockNumber: wire.block_number,
    paymentOrderId: wire.payment_order_id,
    confirmations: wire.confirmations,
    detectedAt: wire.detected_at,
  }
}

function fromWireEventDetail(wire: WireNormalizedEventDetail): NormalizedEventDetail {
  return {
    ...fromWireEvent(wire),
    rawChainEvent: {
      id: wire.raw_chain_event.id,
      source: wire.raw_chain_event.source,
      blockHash: wire.raw_chain_event.block_hash,
      receivedAt: wire.raw_chain_event.received_at,
      payload: wire.raw_chain_event.payload,
    },
    paymentOrder: wire.payment_order
      ? {
          id: wire.payment_order.id,
          merchantOrderId: wire.payment_order.merchant_order_id,
          status: wire.payment_order.status as PaymentOrderStatus,
          settlementAsset: wire.payment_order.settlement_asset as Asset | undefined,
          amount: wire.payment_order.amount,
        }
      : null,
    deliveries: wire.deliveries.map((delivery) => ({
      id: delivery.id,
      webhookEndpointId: delivery.webhook_endpoint_id,
      eventType: delivery.event_type as NormalizedEventDetail['deliveries'][number]['eventType'],
      status: delivery.status as NormalizedEventDetail['deliveries'][number]['status'],
      attempts: delivery.attempts,
      responseStatus: delivery.response_status,
      errorMessage: delivery.error_message,
      lastAttemptAt: delivery.last_attempt_at,
      createdAt: delivery.created_at,
    })),
  }
}
