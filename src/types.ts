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
  | 'refund.requested'
  | 'refund.submitted'
  | 'refund.confirmed'
  | 'refund.failed'
  | 'address.pool.low'
  | 'webhook.delivery.failed'
  | 'agent.action.requested'
  | 'agent.action.approved'
  | 'agent.action.executed'
  | 'agent_payment.intent.created'
  | 'agent_payment.intent.awaiting_approval'
  | 'agent_payment.approval.approved'
  | 'agent_payment.approval.rejected'
  | 'agent_payment.approval.expired'
  | 'agent_payment.authorization.issued'
  | 'agent_payment.authorization.expired'
  | 'agent_payment.settlement.unknown'
  | 'agent_payment.settlement.settled'
  | 'agent_payment.settlement.reverted'
  | 'agent_payment.resource.succeeded'
  | 'agent_payment.resource.failed'
  | 'agent_payment.resource.unknown'
  | 'agent_payment.agent.paused'
  | 'agent_payment.organization.paused'
  | 'end_user_subscription.created'
  | 'end_user_subscription.activated'
  | 'end_user_subscription.renewed'
  | 'end_user_subscription.canceled'
  | 'end_user_subscription.expired'
  | 'end_user_subscription.past_due'
  | 'end_user_invoice.open'
  | 'end_user_invoice.paid'
  | 'end_user_invoice.payment_failed'
  | 'end_user_invoice.payment_late'

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

export type AgentSession = {
  id: string
  label: string | null
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export type AgentPolicy = {
  id: string
  allowedTools: string[]
  requireApproval: boolean
  createdAt: string
  updatedAt: string
}

export type AgentAction = {
  id: string
  agentSessionId: string
  tool: string
  input: unknown
  status: string
  approverId: string | null
  decidedAt: string | null
  executedAt: string | null
  result: unknown
  errorMessage: string | null
  createdAt: string
}

export type AgentPage<T> = { items: T[]; hasMore: boolean; total: number }

export type CreateAgentSessionInput = { label?: string; expiresAt?: string }

export type UpsertAgentPolicyInput = {
  allowedTools?: string[]
  requireApproval?: boolean
}

export type RequestAgentActionInput = {
  agentSessionId: string
  tool: string
  input: Record<string, unknown>
}

export type RequestAgentActionResult = {
  decision: 'auto_allowed' | 'pending_approval'
  actionId: string
}

export type MarkAgentActionExecutedInput = {
  agentSessionId: string
  result?: unknown
  errorMessage?: string
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

export type RefundStatus = 'requested' | 'submitted' | 'confirmed' | 'failed' | 'canceled'

export type CreateRefundInput = {
  paymentOrderId: string
  amount: string
  destinationAddress: string
}

export type Refund = {
  id: string
  paymentOrderId: string
  sourcePaymentEventId: string
  chain: ChainId
  asset: Asset
  amount: string
  amountMinor: string
  sourceAddress: string
  destinationAddress: string
  status: RefundStatus
  txHash: string | null
  failureReason: string | null
  submittedAt: string | null
  confirmedAt: string | null
  canceledAt: string | null
  createdAt: string
  updatedAt: string
}

export type ListRefundsParams = {
  paymentOrderId?: string
  status?: RefundStatus
  limit?: number
  offset?: number
}

export type RefundListPage = { items: Refund[]; hasMore: boolean; total: number }

export type PaymentLinkPayerField = 'name' | 'email' | 'reference' | 'note'
export type PaymentLinkPayer = Partial<Record<PaymentLinkPayerField, string>>
export type PaymentLinkStatus = 'active' | 'inactive'

export type CreatePaymentLinkInput = {
  title: string
  description?: string
  amount: string
  amountMode?: 'exact' | 'auto'
  settlementAsset?: Asset
  acceptedAssets: AcceptedAssetInput[]
  successUrl?: string
  cancelUrl?: string
  walletConnectProjectId?: string
  expiresInMinutes?: number
  payerFields?: PaymentLinkPayerField[]
}

export type UpdatePaymentLinkInput = {
  title?: string
  description?: string | null
  status?: PaymentLinkStatus
  successUrl?: string | null
  cancelUrl?: string | null
  expiresInMinutes?: number
  payerFields?: PaymentLinkPayerField[]
}

export type PaymentLink = {
  id: string
  slug: string
  title: string
  description: string | null
  amount: string
  amountMode: 'exact' | 'auto'
  settlementAsset: Asset | null
  acceptedAssets: AcceptedAssetInput[]
  successUrl: string | null
  cancelUrl: string | null
  walletConnectProjectId: string | null
  expiresInMinutes: number
  payerFields?: PaymentLinkPayerField[]
  status: PaymentLinkStatus
  checkoutCount: number
  createdAt: string
  updatedAt: string
}

export type ListPaymentLinksParams = { limit?: number; offset?: number }
export type PaymentLinkListPage = { items: PaymentLink[]; hasMore: boolean; total: number }
export type ListPaymentLinkOrdersParams = ListPaymentLinksParams & { status?: PaymentOrderStatus }

export type PaymentLinkOrder = {
  id: string
  merchantOrderId: string
  amount: string
  status: PaymentOrderStatus
  createdAt: string
  payer: PaymentLinkPayer | null
  payments: { chain: string; asset: Asset; amount: string; txHash: string }[]
}

export type PaymentLinkOrdersPage = {
  link: PaymentLink
  items: PaymentLinkOrder[]
  total: number
  hasMore: boolean
  completed: number
}
