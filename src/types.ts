export type ChainId =
  | 'ethereum'
  | 'base'
  | 'base-sepolia'
  | 'arbitrum'
  | 'polygon'
  | 'tron'
  | 'solana'
  | 'ethereum-sepolia'
  | 'arbitrum-sepolia'
  | 'polygon-amoy'
  | 'solana-devnet'
  | 'tron-nile'

export type Asset = 'USDC' | 'USDT'

export type PaymentOrderStatus =
  | 'created'
  | 'detected'
  | 'confirmed'
  | 'finalized'
  | 'reverted'
  | 'expired'
  | 'canceled'

export type AcceptedAssetInput = { chain: ChainId; asset: Asset }

export type WebhookEventType =
  | 'payment_order.created'
  | 'payment.detected'
  | 'payment.confirmed'
  | 'payment.finalized'
  | 'payment.reverted'
  | 'payment.expired'
  | 'address.pool.low'
  | 'webhook.delivery.failed'
  | 'agent.action.requested'
  | 'agent.action.approved'
  | 'agent.action.executed'

export type WebhookDeliveryStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'dead_letter'

export type CreatePaymentOrderInput = {
  merchantOrderId: string
  amount: string
  // 'auto' 让服务端把金额微调到唯一（SHARED 地址免手动错开金额）；省略即默认 'exact'。
  amountMode?: 'exact' | 'auto'
  acceptedAssets: AcceptedAssetInput[]
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export type PaymentOrderInstruction = {
  chain: ChainId
  asset: Asset
  address: string
}

export type PaymentOrder = {
  id: string
  merchantOrderId: string
  amount: string
  // 商户传入的基准金额；exact 单 == amount，auto 单为微调前金额（对账用）。
  requestedAmount: string
  settlementAsset?: Asset
  status: PaymentOrderStatus
  expiresAt: string | null
  metadata: unknown
  createdAt: string
  acceptedAssets?: AcceptedAssetInput[]
  paymentInstructions: PaymentOrderInstruction[]
}

export type PaymentOrderTimelineEntry = {
  from: PaymentOrderStatus | null
  to: PaymentOrderStatus
  reason: string | null
  at: string
}

export type PaymentOrderDetail = PaymentOrder & {
  timeline: PaymentOrderTimelineEntry[]
}

export type NormalizedEvent = {
  id: string
  chain: ChainId
  asset: Asset
  fromAddress: string
  toAddress: string
  amount: string
  txHash: string
  logIndex: number
  blockNumber: string
  paymentOrderId: string | null
  confirmations: number
  detectedAt: string
}

export type RawChainEvent = {
  id: string
  source: string
  blockHash: string | null
  receivedAt: string
  payload: unknown
}

export type EventPaymentOrderSummary = {
  id: string
  merchantOrderId: string
  status: PaymentOrderStatus
  settlementAsset?: Asset
  amount: string
}

export type EventWebhookDelivery = {
  id: string
  webhookEndpointId: string
  eventType: WebhookEventType
  status: WebhookDeliveryStatus
  attempts: number
  responseStatus: number | null
  errorMessage: string | null
  lastAttemptAt: string | null
  createdAt: string
}

export type NormalizedEventDetail = NormalizedEvent & {
  rawChainEvent: RawChainEvent
  paymentOrder: EventPaymentOrderSummary | null
  deliveries: EventWebhookDelivery[]
}

export type WebhookEndpoint = {
  id: string
  url: string
  description: string | null
  enabledEvents: WebhookEventType[]
  redactMetadata: boolean
  disabledAt: string | null
  createdAt: string
  secret?: string
}

export type CreateWebhookEndpointInput = {
  url: string
  description?: string
  enabledEvents?: WebhookEventType[]
  redactMetadata?: boolean
}

export type UpdateWebhookEndpointInput = {
  description?: string | null
  enabledEvents?: WebhookEventType[]
  redactMetadata?: boolean
}

export type WebhookDelivery = {
  id: string
  webhookEndpointId: string
  eventId: string
  eventType: WebhookEventType
  paymentOrderId: string | null
  status: WebhookDeliveryStatus
  attempts: number
  responseStatus: number | null
  responseDurationMs: number | null
  errorMessage: string | null
  nextRetryAt: string | null
  lastAttemptAt: string | null
  succeededAt: string | null
  deadLetteredAt: string | null
  createdAt: string
  // 完整事件 payload（与 replay 复用同一份）。
  payload: Record<string, unknown>
}

export type ReplayDeliveryResult = {
  deliveryId: string
}

export type ReplayDeadLettersInput = {
  endpointId?: string
  limit?: number
}

export type ReplayDeadLettersResult = {
  replayed: number
  items: { originalId: string; deliveryId: string }[]
}
