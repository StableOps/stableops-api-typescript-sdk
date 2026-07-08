export type ChainId =
  | 'ethereum'
  | 'base'
  | 'base-sepolia'
  | 'arbitrum'
  | 'polygon'
  | 'optimism'
  | 'bsc'
  | 'tron'
  | 'solana'
  | 'ethereum-sepolia'
  | 'arbitrum-sepolia'
  | 'polygon-amoy'
  | 'optimism-sepolia'
  | 'bsc-testnet'
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
  | 'payment_order.canceled'
  | 'address.pool.low'
  | 'webhook.delivery.failed'
  | 'agent.action.requested'
  | 'agent.action.approved'
  | 'agent.action.executed'

export type WebhookDeliveryStatus = 'pending' | 'succeeded' | 'failed' | 'dead_letter'

export type CreatePaymentOrderInput = {
  merchantOrderId: string
  amount: string
  // 'auto' 让服务端把金额微调到唯一（SHARED 地址免手动错开金额）；省略即默认 'exact'。
  amountMode?: 'exact' | 'auto'
  acceptedAssets: AcceptedAssetInput[]
  // 必传:ISO 8601 过期时间。上限 SANDBOX 30 分钟 / LIVE 24 小时,超限服务端 400。
  expiresAt: string
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

export type CheckoutSessionStatus = 'open' | 'completed' | 'expired' | 'canceled'

export type CreateCheckoutSessionInput = CreatePaymentOrderInput & {
  title?: string
  description?: string
  successUrl?: string
  cancelUrl?: string
  walletConnectProjectId?: string
}

export type CheckoutSession = {
  id: string
  clientSecret?: string
  url?: string
  status: CheckoutSessionStatus
  title: string | null
  description: string | null
  successUrl: string | null
  cancelUrl: string | null
  walletConnectProjectId: string | null
  expiresAt: string | null
  createdAt: string
  paymentOrder: PaymentOrder
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

export type MerchantPlanInterval = 'month' | 'year' | 'week' | 'custom_days'

export type EndUserSubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

export type EndUserInvoiceStatus = 'open' | 'paid' | 'void' | 'uncollectible'

export type EndUserInvoiceKind = 'first' | 'renewal' | 'upgrade_proration'

export type MerchantPlan = {
  id: string
  code: string
  name: string
  description: string | null
  groupKey: string
  amount: string
  interval: MerchantPlanInterval
  intervalCount: number
  trialDays: number | null
  metadata: Record<string, unknown> | null
  isActive: boolean
  isTemplate: boolean
  createdAt: string
  updatedAt: string
}

export type CreateMerchantPlanInput = {
  code: string
  name: string
  description?: string | null
  groupKey: string
  amount: string
  interval: MerchantPlanInterval
  intervalCount: number
  trialDays?: number | null
  metadata?: Record<string, unknown> | null
  isTemplate?: boolean
}

export type UpdateMerchantPlanInput = Partial<CreateMerchantPlanInput>

export type EndUserSubscription = {
  id: string
  merchantUserId: string
  planId: string
  status: EndUserSubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  pendingPlanId: string | null
  pendingPlanChangeAt: string | null
  trialEndsAt: string | null
  canceledAt: string | null
  createdAt: string
  updatedAt: string
}

export type EndUserInvoice = {
  id: string
  subscriptionId: string
  merchantUserId: string
  kind: EndUserInvoiceKind
  periodStart: string
  periodEnd: string
  amount: string
  asset: Asset | null
  status: EndUserInvoiceStatus
  paymentOrderId: string | null
  targetPlanId: string | null
  dueAt: string
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export type MerchantSubscriptionCreateResult = {
  subscription: EndUserSubscription
  invoice: EndUserInvoice | null
}

export type MerchantSubscriptionChangePlanResult = MerchantSubscriptionCreateResult & {
  pending: boolean
}

export type CreateEndUserSubscriptionInput = {
  planId: string
  merchantUserId: string
  trialDays?: number
}

export type ChangeEndUserSubscriptionPlanInput = {
  planId: string
}

export type CancelEndUserSubscriptionInput = {
  immediate?: boolean
}

export type MerchantBillingSettings = {
  payWindowDays: number
  renewalLeadDays: number
  graceDays: number
}

export type UpdateMerchantBillingSettingsInput = Partial<MerchantBillingSettings>

export type CreatePortalSessionInput = {
  merchantUserId: string
  expiresAt?: string
}

export type PortalSession = {
  id: string
  portalToken: string
  expiresAt: string
}

export type PayMerchantInvoiceResponse = {
  invoiceId: string
  paymentOrderId: string
  status: EndUserInvoiceStatus
  paymentOrder: PaymentOrder
}

export type PayMerchantInvoiceInput = {
  amountMode?: 'exact' | 'auto'
  acceptedAssets: AcceptedAssetInput[]
}

export type MerchantInvoicePaymentStatus = {
  invoiceId: string
  status: EndUserInvoiceStatus
  paymentOrder: PaymentOrder | null
}

export type CreateInvoiceCheckoutSessionInput = {
  acceptedAssets: AcceptedAssetInput[]
  amountMode?: 'exact' | 'auto'
  title?: string
  successUrl?: string
  cancelUrl?: string
  walletConnectProjectId?: string
}

export type MerchantInvoiceCheckoutSession = {
  checkoutSessionId: string
  clientSecret: string
  checkoutUrl: string
  paymentOrder: PaymentOrder
}
