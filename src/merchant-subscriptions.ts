import type { HttpClient } from './http'
import { buildCheckoutUrl, fromWire, type WirePaymentOrder } from './payment-orders'
import type {
  CancelEndUserSubscriptionInput,
  ChangeEndUserSubscriptionPlanInput,
  CreateEndUserSubscriptionInput,
  CreateInvoiceCheckoutSessionInput,
  CreateMerchantPlanInput,
  CreatePortalSessionInput,
  EndUserInvoice,
  EndUserInvoiceStatus,
  EndUserSubscription,
  EndUserSubscriptionStatus,
  MerchantBillingSettings,
  MerchantInvoiceCheckoutSession,
  MerchantInvoicePaymentStatus,
  MerchantPlan,
  MerchantSubscriptionChangePlanResult,
  MerchantSubscriptionCreateResult,
  PayMerchantInvoiceInput,
  PayMerchantInvoiceResponse,
  PortalSession,
  UpdateMerchantBillingSettingsInput,
  UpdateMerchantPlanInput,
} from './types'

type WriteOptions = { idempotencyKey?: string }

export type MerchantSubscriptionsApiOptions = {
  checkoutBaseUrl?: string
}

type WireMerchantPlan = {
  id: string
  code: string
  name: string
  description: string | null
  group_key: string
  amount: string
  interval: MerchantPlan['interval']
  interval_count: number
  trial_days: number | null
  metadata: Record<string, unknown> | null
  is_active: boolean
  is_template: boolean
  created_at: string
  updated_at: string
}

type WireEndUserSubscription = {
  id: string
  merchant_user_id: string
  plan_id: string
  status: EndUserSubscription['status']
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  pending_plan_id: string | null
  pending_plan_change_at: string | null
  trial_ends_at: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

type WireEndUserInvoice = {
  id: string
  subscription_id: string
  merchant_user_id: string
  kind: EndUserInvoice['kind']
  period_start: string
  period_end: string
  amount: string
  asset: EndUserInvoice['asset']
  status: EndUserInvoice['status']
  payment_order_id: string | null
  target_plan_id: string | null
  due_at: string
  paid_at: string | null
  created_at: string
  updated_at: string
}

type WireMerchantBillingSettings = {
  pay_window_days: number
  renewal_lead_days: number
  grace_days: number
}

type WireMerchantSubscriptionCreateResult = {
  subscription: WireEndUserSubscription
  invoice: WireEndUserInvoice | null
}

type WireMerchantSubscriptionChangePlanResult = WireMerchantSubscriptionCreateResult & {
  pending: boolean
}

type WirePayMerchantInvoiceResponse = {
  invoice_id: string
  payment_order_id: string
  status: PayMerchantInvoiceResponse['status']
  payment_order: WirePaymentOrder
}

type WireMerchantInvoicePaymentStatus = {
  invoice_id: string
  status: MerchantInvoicePaymentStatus['status']
  payment_order: WirePaymentOrder | null
}

type WirePortalSession = {
  id: string
  portal_token: string
  expires_at: string
}

type WireMerchantInvoiceCheckoutSession = {
  checkout_session_id: string
  client_secret: string
  payment_order: WirePaymentOrder
}

export class MerchantSubscriptionsApi {
  readonly plans: MerchantPlansResource
  readonly subscriptions: MerchantSubscriptionResource
  readonly invoices: MerchantInvoicesResource
  readonly settings: MerchantSettingsResource
  readonly portalSessions: MerchantPortalSessionsResource

  constructor(http: HttpClient) {
    this.plans = new MerchantPlansResource(http)
    this.subscriptions = new MerchantSubscriptionResource(http)
    this.invoices = new MerchantInvoicesResource(http)
    this.settings = new MerchantSettingsResource(http)
    this.portalSessions = new MerchantPortalSessionsResource(http)
  }
}

export class MerchantPortalApi {
  readonly plans: MerchantPortalPlansResource
  readonly subscription: MerchantPortalSubscriptionResource
  readonly invoices: MerchantPortalInvoicesResource
  private readonly checkoutBaseUrl: string

  constructor(http: HttpClient, options: MerchantSubscriptionsApiOptions = {}) {
    this.checkoutBaseUrl = (options.checkoutBaseUrl ?? 'https://pay.stableops.dev').replace(
      /\/+$/u,
      '',
    )
    this.plans = new MerchantPortalPlansResource(http)
    this.subscription = new MerchantPortalSubscriptionResource(http)
    this.invoices = new MerchantPortalInvoicesResource(http, this.checkoutBaseUrl)
  }
}

class MerchantPlansResource {
  constructor(private readonly http: HttpClient) {}

  async list(params: { groupKey?: string; includeInactive?: boolean } = {}) {
    const wire = await this.http.request<WireMerchantPlan[]>({
      method: 'GET',
      path: '/v1/merchant/plans',
      query: {
        group_key: params.groupKey,
        include_inactive: params.includeInactive ? 'true' : undefined,
      },
    })
    return wire.map(fromPlanWire)
  }

  async create(input: CreateMerchantPlanInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WireMerchantPlan>({
      method: 'POST',
      path: '/v1/merchant/plans',
      body: toPlanWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromPlanWire(wire)
  }

  async update(id: string, input: UpdateMerchantPlanInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WireMerchantPlan>({
      method: 'PUT',
      path: `/v1/merchant/plans/${encodeURIComponent(id)}`,
      body: toPlanWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromPlanWire(wire)
  }

  async delete(id: string, options: WriteOptions = {}) {
    await this.http.request<null>({
      method: 'DELETE',
      path: `/v1/merchant/plans/${encodeURIComponent(id)}`,
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
  }
}

class MerchantSubscriptionResource {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateEndUserSubscriptionInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WireMerchantSubscriptionCreateResult>({
      method: 'POST',
      path: '/v1/merchant/subscriptions',
      body: toCreateSubscriptionWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromCreateResultWire(wire)
  }

  async list(params: { status?: EndUserSubscriptionStatus; merchantUserId?: string } = {}) {
    const wire = await this.http.request<WireEndUserSubscription[]>({
      method: 'GET',
      path: '/v1/merchant/subscriptions',
      query: {
        status: params.status,
        merchant_user_id: params.merchantUserId,
      },
    })
    return wire.map(fromSubscriptionWire)
  }

  async get(id: string) {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'GET',
      path: `/v1/merchant/subscriptions/${encodeURIComponent(id)}`,
    })
    return fromSubscriptionWire(wire)
  }

  async getByMerchantUserId(merchantUserId: string) {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'GET',
      path: `/v1/merchant/subscriptions/by-user/${encodeURIComponent(merchantUserId)}`,
    })
    return fromSubscriptionWire(wire)
  }

  async changePlan(
    id: string,
    input: ChangeEndUserSubscriptionPlanInput,
    options: WriteOptions = {},
  ) {
    const wire = await this.http.request<WireMerchantSubscriptionChangePlanResult>({
      method: 'POST',
      path: `/v1/merchant/subscriptions/${encodeURIComponent(id)}/change-plan`,
      body: { plan_id: input.planId },
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromChangePlanResultWire(wire)
  }

  async cancel(id: string, input: CancelEndUserSubscriptionInput = {}, options: WriteOptions = {}) {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'POST',
      path: `/v1/merchant/subscriptions/${encodeURIComponent(id)}/cancel`,
      body: { immediate: input.immediate },
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromSubscriptionWire(wire)
  }

  async resume(id: string, options: WriteOptions = {}) {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'POST',
      path: `/v1/merchant/subscriptions/${encodeURIComponent(id)}/resume`,
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromSubscriptionWire(wire)
  }
}

class MerchantInvoicesResource {
  constructor(private readonly http: HttpClient) {}

  async list(
    params: {
      status?: EndUserInvoiceStatus
      merchantUserId?: string
      subscriptionId?: string
    } = {},
  ) {
    const wire = await this.http.request<WireEndUserInvoice[]>({
      method: 'GET',
      path: '/v1/merchant/invoices',
      query: {
        status: params.status,
        merchant_user_id: params.merchantUserId,
        subscription_id: params.subscriptionId,
      },
    })
    return wire.map(fromInvoiceWire)
  }

  async get(id: string) {
    const wire = await this.http.request<WireEndUserInvoice>({
      method: 'GET',
      path: `/v1/merchant/invoices/${encodeURIComponent(id)}`,
    })
    return fromInvoiceWire(wire)
  }

  async pay(id: string, input: PayMerchantInvoiceInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WirePayMerchantInvoiceResponse>({
      method: 'POST',
      path: `/v1/merchant/invoices/${encodeURIComponent(id)}/pay`,
      body: toPayInvoiceWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromPayInvoiceWire(wire)
  }

  async paymentStatus(id: string) {
    const wire = await this.http.request<WireMerchantInvoicePaymentStatus>({
      method: 'GET',
      path: `/v1/merchant/invoices/${encodeURIComponent(id)}/payment-status`,
    })
    return fromPaymentStatusWire(wire)
  }
}

class MerchantSettingsResource {
  constructor(private readonly http: HttpClient) {}

  async get() {
    const wire = await this.http.request<WireMerchantBillingSettings>({
      method: 'GET',
      path: '/v1/merchant/settings',
    })
    return fromSettingsWire(wire)
  }

  async update(input: UpdateMerchantBillingSettingsInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WireMerchantBillingSettings>({
      method: 'PUT',
      path: '/v1/merchant/settings',
      body: toSettingsWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromSettingsWire(wire)
  }
}

class MerchantPortalSessionsResource {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreatePortalSessionInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WirePortalSession>({
      method: 'POST',
      path: '/v1/merchant/portal-sessions',
      body: {
        merchant_user_id: input.merchantUserId,
        expires_at: input.expiresAt,
      },
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromPortalSessionWire(wire)
  }

  async revoke(id: string, options: WriteOptions = {}) {
    await this.http.request<null>({
      method: 'DELETE',
      path: `/v1/merchant/portal-sessions/${encodeURIComponent(id)}`,
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
  }
}

class MerchantPortalPlansResource {
  constructor(private readonly http: HttpClient) {}

  async list() {
    const wire = await this.http.request<WireMerchantPlan[]>({
      method: 'GET',
      path: '/v1/merchant/portal/plans',
    })
    return wire.map(fromPlanWire)
  }
}

class MerchantPortalSubscriptionResource {
  constructor(private readonly http: HttpClient) {}

  async get() {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'GET',
      path: '/v1/merchant/portal/subscription',
    })
    return fromSubscriptionWire(wire)
  }

  async cancel(input: CancelEndUserSubscriptionInput = {}, options: WriteOptions = {}) {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'POST',
      path: '/v1/merchant/portal/subscription/cancel',
      body: { immediate: input.immediate },
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromSubscriptionWire(wire)
  }

  async resume(options: WriteOptions = {}) {
    const wire = await this.http.request<WireEndUserSubscription>({
      method: 'POST',
      path: '/v1/merchant/portal/subscription/resume',
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromSubscriptionWire(wire)
  }

  async changePlan(input: ChangeEndUserSubscriptionPlanInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WireMerchantSubscriptionChangePlanResult>({
      method: 'POST',
      path: '/v1/merchant/portal/subscription/change-plan',
      body: { plan_id: input.planId },
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromChangePlanResultWire(wire)
  }
}

class MerchantPortalInvoicesResource {
  constructor(
    private readonly http: HttpClient,
    private readonly checkoutBaseUrl: string,
  ) {}

  async list(params: { status?: EndUserInvoiceStatus; subscriptionId?: string } = {}) {
    const wire = await this.http.request<WireEndUserInvoice[]>({
      method: 'GET',
      path: '/v1/merchant/portal/invoices',
      query: {
        status: params.status,
        subscription_id: params.subscriptionId,
      },
    })
    return wire.map(fromInvoiceWire)
  }

  async get(id: string) {
    const wire = await this.http.request<WireEndUserInvoice>({
      method: 'GET',
      path: `/v1/merchant/portal/invoices/${encodeURIComponent(id)}`,
    })
    return fromInvoiceWire(wire)
  }

  async pay(id: string, input: PayMerchantInvoiceInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WirePayMerchantInvoiceResponse>({
      method: 'POST',
      path: `/v1/merchant/portal/invoices/${encodeURIComponent(id)}/pay`,
      body: toPayInvoiceWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return fromPayInvoiceWire(wire)
  }

  async checkoutSession(id: string, input: CreateInvoiceCheckoutSessionInput, options: WriteOptions = {}) {
    const wire = await this.http.request<WireMerchantInvoiceCheckoutSession>({
      method: 'POST',
      path: `/v1/merchant/portal/invoices/${encodeURIComponent(id)}/checkout-session`,
      body: toCheckoutSessionWire(input),
      idempotencyKey: options.idempotencyKey,
      retryable: true,
    })
    return {
      checkoutSessionId: wire.checkout_session_id,
      clientSecret: wire.client_secret,
      checkoutUrl: buildCheckoutUrl(
        this.checkoutBaseUrl,
        wire.checkout_session_id,
        wire.client_secret,
      )!,
      paymentOrder: fromWire(wire.payment_order),
    } satisfies MerchantInvoiceCheckoutSession
  }

  async paymentStatus(id: string) {
    const wire = await this.http.request<WireMerchantInvoicePaymentStatus>({
      method: 'GET',
      path: `/v1/merchant/portal/invoices/${encodeURIComponent(id)}/payment-status`,
    })
    return fromPaymentStatusWire(wire)
  }
}

function fromPlanWire(wire: WireMerchantPlan): MerchantPlan {
  return {
    id: wire.id,
    code: wire.code,
    name: wire.name,
    description: wire.description,
    groupKey: wire.group_key,
    amount: wire.amount,
    interval: wire.interval,
    intervalCount: wire.interval_count,
    trialDays: wire.trial_days,
    metadata: wire.metadata,
    isActive: wire.is_active,
    isTemplate: wire.is_template,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}

function fromSubscriptionWire(wire: WireEndUserSubscription): EndUserSubscription {
  return {
    id: wire.id,
    merchantUserId: wire.merchant_user_id,
    planId: wire.plan_id,
    status: wire.status,
    currentPeriodStart: wire.current_period_start,
    currentPeriodEnd: wire.current_period_end,
    cancelAtPeriodEnd: wire.cancel_at_period_end,
    pendingPlanId: wire.pending_plan_id,
    pendingPlanChangeAt: wire.pending_plan_change_at,
    trialEndsAt: wire.trial_ends_at,
    canceledAt: wire.canceled_at,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}

function fromInvoiceWire(wire: WireEndUserInvoice): EndUserInvoice {
  return {
    id: wire.id,
    subscriptionId: wire.subscription_id,
    merchantUserId: wire.merchant_user_id,
    kind: wire.kind,
    periodStart: wire.period_start,
    periodEnd: wire.period_end,
    amount: wire.amount,
    asset: wire.asset,
    status: wire.status,
    paymentOrderId: wire.payment_order_id,
    targetPlanId: wire.target_plan_id,
    dueAt: wire.due_at,
    paidAt: wire.paid_at,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}

function fromCreateResultWire(
  wire: WireMerchantSubscriptionCreateResult,
): MerchantSubscriptionCreateResult {
  return {
    subscription: fromSubscriptionWire(wire.subscription),
    invoice: wire.invoice ? fromInvoiceWire(wire.invoice) : null,
  }
}

function fromChangePlanResultWire(
  wire: WireMerchantSubscriptionChangePlanResult,
): MerchantSubscriptionChangePlanResult {
  return {
    ...fromCreateResultWire(wire),
    pending: wire.pending,
  }
}

function fromSettingsWire(wire: WireMerchantBillingSettings): MerchantBillingSettings {
  return {
    payWindowDays: wire.pay_window_days,
    renewalLeadDays: wire.renewal_lead_days,
    graceDays: wire.grace_days,
  }
}

function fromPortalSessionWire(wire: WirePortalSession): PortalSession {
  return {
    id: wire.id,
    portalToken: wire.portal_token,
    expiresAt: wire.expires_at,
  }
}

function fromPayInvoiceWire(wire: WirePayMerchantInvoiceResponse): PayMerchantInvoiceResponse {
  return {
    invoiceId: wire.invoice_id,
    paymentOrderId: wire.payment_order_id,
    status: wire.status,
    paymentOrder: fromWire(wire.payment_order),
  }
}

function fromPaymentStatusWire(wire: WireMerchantInvoicePaymentStatus): MerchantInvoicePaymentStatus {
  return {
    invoiceId: wire.invoice_id,
    status: wire.status,
    paymentOrder: wire.payment_order ? fromWire(wire.payment_order) : null,
  }
}

function toPlanWire(input: CreateMerchantPlanInput | UpdateMerchantPlanInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    group_key: input.groupKey,
    amount: input.amount,
    interval: input.interval,
    interval_count: input.intervalCount,
    trial_days: input.trialDays,
    metadata: input.metadata,
    is_template: input.isTemplate,
  }
}

function toCreateSubscriptionWire(input: CreateEndUserSubscriptionInput) {
  return {
    plan_id: input.planId,
    merchant_user_id: input.merchantUserId,
    trial_days: input.trialDays,
  }
}

function toSettingsWire(input: UpdateMerchantBillingSettingsInput) {
  return {
    pay_window_days: input.payWindowDays,
    renewal_lead_days: input.renewalLeadDays,
    grace_days: input.graceDays,
  }
}

function toPayInvoiceWire(input: PayMerchantInvoiceInput) {
  return {
    amount_mode: input.amountMode,
    accepted_assets: input.acceptedAssets.map((entry) => ({
      chain: entry.chain,
      asset: entry.asset,
    })),
  }
}

function toCheckoutSessionWire(input: CreateInvoiceCheckoutSessionInput) {
  return {
    title: input.title,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    walletconnect_project_id: input.walletConnectProjectId,
    amount_mode: input.amountMode,
    accepted_assets: input.acceptedAssets.map((entry) => ({
      chain: entry.chain,
      asset: entry.asset,
    })),
  }
}
