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

export type PaymentOrderScenario =
  | 'saas_subscription'
  | 'trading_deposit'
  | 'agent_workflow'
  | 'generic'

export type AcceptedAssetInput = { chain: ChainId; asset: Asset }

export type CreatePaymentOrderInput = {
  merchantOrderId: string
  amount: string
  settlementAsset: Asset
  acceptedAssets: AcceptedAssetInput[]
  scenario?: PaymentOrderScenario
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
  scenario: PaymentOrderScenario
  amount: string
  settlementAsset: Asset
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

export type WebhookEndpoint = {
  id: string
  url: string
  description: string | null
  enabledEvents: string[]
  disabledAt: string | null
  createdAt: string
  secret?: string
}

export type CreateWebhookEndpointInput = {
  url: string
  description?: string
  enabledEvents?: string[]
}
