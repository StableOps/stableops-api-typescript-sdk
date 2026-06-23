import type { HttpClient } from './http'
import type {
  AcceptedAssetInput,
  CheckoutSession,
  CreatePaymentOrderInput,
  CreateCheckoutSessionInput,
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
    this.checkoutBaseUrl = (options.checkoutBaseUrl ?? 'https://pay.stableops.dev').replace(
      /\/+$/u,
      '',
    )
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

function fromCheckoutWire(wire: WireCheckoutSession, checkoutBaseUrl: string): CheckoutSession {
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
