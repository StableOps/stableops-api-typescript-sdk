import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpClient } from './http'
import { StableOps } from './index'
import { MerchantPortalApi, MerchantSubscriptionsApi } from './merchant-subscriptions'

const BASE_URL = 'https://api.test.local'
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const planWire = {
  id: 'plan_1',
  code: 'starter',
  name: 'Starter',
  description: null,
  group_key: 'demo',
  amount: '0.01',
  interval: 'month',
  interval_count: 1,
  trial_days: null,
  metadata: { source: 'sdk' },
  is_active: true,
  is_template: false,
  created_at: '2026-07-06T00:00:00.000Z',
  updated_at: '2026-07-06T00:00:00.000Z',
}

const subscriptionWire = {
  id: 'sub_1',
  merchant_user_id: 'user_1',
  plan_id: 'plan_1',
  status: 'active',
  current_period_start: '2026-07-01T00:00:00.000Z',
  current_period_end: '2026-08-01T00:00:00.000Z',
  cancel_at_period_end: false,
  pending_plan_id: null,
  pending_plan_change_at: null,
  trial_ends_at: null,
  canceled_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

const invoiceWire = {
  id: 'inv_1',
  subscription_id: 'sub_1',
  merchant_user_id: 'user_1',
  kind: 'first',
  period_start: '2026-07-01T00:00:00.000Z',
  period_end: '2026-08-01T00:00:00.000Z',
  amount: '0.01',
  asset: null,
  status: 'open',
  payment_order_id: 'po_1',
  target_plan_id: null,
  due_at: '2026-07-08T00:00:00.000Z',
  paid_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

const paymentOrderWire = {
  id: 'po_1',
  merchant_order_id: 'euinv_inv_1',
  amount: '0.01',
  requested_amount: '0.01',
  settlement_asset: 'USDC',
  status: 'created',
  expires_at: '2026-07-06T00:30:00.000Z',
  metadata: null,
  created_at: '2026-07-06T00:00:00.000Z',
  accepted_assets: [{ chain: 'base-sepolia', asset: 'USDC' }],
  payment_instructions: [
    {
      chain: 'base-sepolia',
      asset: 'USDC',
      address: '0x0000000000000000000000000000000000000001',
    },
  ],
}

describe('MerchantSubscriptionsApi', () => {
  it('creates plans with snake_case body and idempotency key', async () => {
    let idempotencyKey = ''
    server.use(
      http.post(`${BASE_URL}/v1/merchant/plans`, async ({ request }) => {
        idempotencyKey = request.headers.get('idempotency-key') ?? ''
        expect(await request.json()).toEqual({
          code: 'starter',
          name: 'Starter',
          group_key: 'demo',
          amount: '0.01',
          interval: 'month',
          interval_count: 1,
        })
        return HttpResponse.json(planWire, { status: 201 })
      }),
    )

    const api = new MerchantSubscriptionsApi(new HttpClient({ baseUrl: BASE_URL }))
    const plan = await api.plans.create(
      {
        code: 'starter',
        name: 'Starter',
        groupKey: 'demo',
        amount: '0.01',
        interval: 'month',
        intervalCount: 1,
      },
      { idempotencyKey: 'plan_starter' },
    )

    expect(idempotencyKey).toBe('plan_starter')
    expect(plan.groupKey).toBe('demo')
    expect(plan.intervalCount).toBe(1)
    expect(plan.createdAt).toBe('2026-07-06T00:00:00.000Z')
  })

  it('lists invoices with filters and maps invoice fields', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/merchant/invoices`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('status')).toBe('open')
        expect(url.searchParams.get('merchant_user_id')).toBe('user_1')
        expect(url.searchParams.get('subscription_id')).toBe('sub_1')
        return HttpResponse.json([invoiceWire])
      }),
    )

    const api = new MerchantSubscriptionsApi(new HttpClient({ baseUrl: BASE_URL }))
    const invoices = await api.invoices.list({
      status: 'open',
      merchantUserId: 'user_1',
      subscriptionId: 'sub_1',
    })

    expect(invoices[0]).toMatchObject({
      subscriptionId: 'sub_1',
      merchantUserId: 'user_1',
      paymentOrderId: 'po_1',
      dueAt: '2026-07-08T00:00:00.000Z',
    })
    // 未结算的账单 asset 为 null，付款人支付时才确定币种。
    expect(invoices[0].asset).toBeNull()
  })

  it('updates settings without accepted chains or amount mode', async () => {
    server.use(
      http.put(`${BASE_URL}/v1/merchant/settings`, async ({ request }) => {
        expect(await request.json()).toEqual({
          pay_window_days: 3,
        })
        return HttpResponse.json({
          pay_window_days: 3,
          renewal_lead_days: 2,
          grace_days: 1,
        })
      }),
    )

    const api = new MerchantSubscriptionsApi(new HttpClient({ baseUrl: BASE_URL }))
    const settings = await api.settings.update({
      payWindowDays: 3,
    })

    expect(settings).toMatchObject({
      payWindowDays: 3,
      renewalLeadDays: 2,
      graceDays: 1,
    })
  })

  it('pays invoices with explicit accepted assets', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/merchant/invoices/inv_1/pay`, async ({ request }) => {
        expect(await request.json()).toEqual({
          amount_mode: 'auto',
          accepted_assets: [{ chain: 'bsc-testnet', asset: 'USDT' }],
        })
        return HttpResponse.json({
          invoice_id: 'inv_1',
          payment_order_id: 'po_1',
          status: 'open',
          payment_order: paymentOrderWire,
        })
      }),
    )

    const api = new MerchantSubscriptionsApi(new HttpClient({ baseUrl: BASE_URL }))
    const payment = await api.invoices.pay('inv_1', {
      amountMode: 'auto',
      acceptedAssets: [{ chain: 'bsc-testnet', asset: 'USDT' }],
    })

    expect(payment.paymentOrderId).toBe('po_1')
  })
})

describe('MerchantPortalApi', () => {
  it('creates invoice checkout sessions and returns checkoutUrl', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/merchant/portal/invoices/inv_1/checkout-session`, async ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer eps_token')
        expect(await request.json()).toEqual({
          success_url: 'https://merchant.test/success',
          cancel_url: 'https://merchant.test/cancel',
          walletconnect_project_id: 'wc_123',
          amount_mode: 'auto',
          accepted_assets: [{ chain: 'base-sepolia', asset: 'USDC' }],
        })
        return HttpResponse.json({
          checkout_session_id: 'cs_1',
          client_secret: 'cs_secret',
          payment_order: paymentOrderWire,
        })
      }),
    )

    const api = new MerchantPortalApi(new HttpClient({ baseUrl: BASE_URL, apiKey: 'eps_token' }), {
      checkoutBaseUrl: 'https://checkout.test',
    })
    const session = await api.invoices.checkoutSession(
      'inv_1',
      {
        successUrl: 'https://merchant.test/success',
        cancelUrl: 'https://merchant.test/cancel',
        walletConnectProjectId: 'wc_123',
        amountMode: 'auto',
        acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
      },
    )

    expect(session).toMatchObject({
      checkoutSessionId: 'cs_1',
      clientSecret: 'cs_secret',
      checkoutUrl: 'https://checkout.test/c/cs_1?client_secret=cs_secret',
      paymentOrder: { merchantOrderId: 'euinv_inv_1' },
    })
  })

  it('maps portal subscription actions', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/merchant/portal/subscription/change-plan`, async ({ request }) => {
        expect(await request.json()).toEqual({ plan_id: 'plan_2' })
        return HttpResponse.json({
          subscription: { ...subscriptionWire, pending_plan_id: 'plan_2' },
          invoice: { ...invoiceWire, kind: 'upgrade_proration', target_plan_id: 'plan_2' },
          pending: false,
        })
      }),
    )

    const api = new MerchantPortalApi(new HttpClient({ baseUrl: BASE_URL, apiKey: 'eps_token' }))
    const result = await api.subscription.changePlan({ planId: 'plan_2' })

    expect(result).toMatchObject({
      subscription: { pendingPlanId: 'plan_2' },
      invoice: { kind: 'upgrade_proration', targetPlanId: 'plan_2' },
      pending: false,
    })
  })
})

describe('StableOps merchant portal factory', () => {
  it('uses portal token authorization and parent checkoutBaseUrl', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/merchant/portal/plans`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer eps_token')
        return HttpResponse.json([planWire])
      }),
    )

    const stableops = new StableOps({
      apiKey: 'sk_sandbox_parent',
      baseUrl: BASE_URL,
      checkoutBaseUrl: 'https://checkout.test',
    })
    const portal = stableops.portal('eps_token')
    const plans = await portal.plans.list()

    expect(plans[0].groupKey).toBe('demo')
  })
})
