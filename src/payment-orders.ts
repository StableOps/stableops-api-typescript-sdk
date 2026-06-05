import type { HttpClient } from './http'
import type {
  AcceptedAssetInput,
  CreatePaymentOrderInput,
  NormalizedEvent,
  PaymentOrder,
  PaymentOrderDetail,
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

  async list(params: { status?: string; limit?: number } = {}): Promise<PaymentOrder[]> {
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

export class EventsApi {
  constructor(private readonly http: HttpClient) {}

  async list(
    params: { chain?: string; asset?: string; paymentOrderId?: string; limit?: number } = {},
  ): Promise<NormalizedEvent[]> {
    const wire = await this.http.request<{ items: WireNormalizedEvent[] }>({
      method: 'GET',
      path: '/v1/events',
      query: {
        chain: params.chain,
        asset: params.asset,
        payment_order_id: params.paymentOrderId,
        limit: params.limit,
      },
    })
    return wire.items.map(fromWireEvent)
  }
}

// ---- 内部 wire 类型，避免 SDK 公开蛇形命名 ----

type WirePaymentOrder = {
  id: string
  merchant_order_id: string
  scenario: string
  amount: string
  settlement_asset: string
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

function toCreateWire(input: CreatePaymentOrderInput) {
  return {
    merchant_order_id: input.merchantOrderId,
    scenario: input.scenario,
    amount: input.amount,
    settlement_asset: input.settlementAsset,
    accepted_assets: input.acceptedAssets.map((entry) => ({
      chain: entry.chain,
      asset: entry.asset,
    })),
    expires_at: input.expiresAt,
    metadata: input.metadata,
  }
}

function fromWire(wire: WirePaymentOrder): PaymentOrder {
  return {
    id: wire.id,
    merchantOrderId: wire.merchant_order_id,
    scenario: wire.scenario as PaymentOrder['scenario'],
    amount: wire.amount,
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
