import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpClient } from './http'
import { CheckoutSessionsApi, PaymentOrdersApi } from './payment-orders'

const BASE_URL = 'https://api.test.local'
const ORDERS = `${BASE_URL}/v1/payment-orders`
const CHECKOUT_SESSIONS = `${BASE_URL}/v1/checkout-sessions`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('PaymentOrdersApi', () => {
  it('把 payment_instructions 映射为 paymentInstructions', async () => {
    server.use(
      http.post(ORDERS, () =>
        HttpResponse.json({
          id: 'po_1',
          merchant_order_id: 'merchant_1',
          amount: '12.00',
          settlement_asset: 'USDC',
          status: 'created',
          expires_at: null,
          metadata: null,
          created_at: '2026-06-01T00:00:00.000Z',
          accepted_assets: [
            { chain: 'base', asset: 'USDC' },
            { chain: 'tron', asset: 'USDT' },
          ],
          payment_instructions: [
            { chain: 'base', asset: 'USDC', address: '0xbase' },
            { chain: 'tron', asset: 'USDT', address: 'TTron' },
          ],
        }),
      ),
    )

    const api = new PaymentOrdersApi(new HttpClient({ baseUrl: BASE_URL }))
    const order = await api.create(
      {
        merchantOrderId: 'merchant_1',
        amount: '12.00',
        acceptedAssets: [
          { chain: 'base', asset: 'USDC' },
          { chain: 'tron', asset: 'USDT' },
        ],
        expiresAt: '2026-12-31T00:00:00.000Z',
      },
      { idempotencyKey: 'merchant_1' },
    )

    expect(order.paymentInstructions).toEqual([
      { chain: 'base', asset: 'USDC', address: '0xbase' },
      { chain: 'tron', asset: 'USDT', address: 'TTron' },
    ])
    expect(order).not.toHaveProperty('paymentInstruction')
  })
})

describe('CheckoutSessionsApi', () => {
  it('创建托管 checkout session 并返回可跳转 url', async () => {
    let idempotencyKey = ''
    server.use(
      http.post(CHECKOUT_SESSIONS, async ({ request }) => {
        idempotencyKey = request.headers.get('idempotency-key') ?? ''
        expect(await request.json()).toEqual({
          merchant_order_id: 'merchant_1',
          amount: '49.00',
          amount_mode: 'auto',
          accepted_assets: [{ chain: 'base-sepolia', asset: 'USDC' }],
          title: 'Acme Pro',
          success_url: 'https://merchant.test/success',
          cancel_url: 'https://merchant.test/cancel',
          metadata: { plan: 'pro' },
          expires_at: '2026-12-31T00:00:00.000Z',
        })

        return HttpResponse.json(
          {
            id: 'cs_1',
            client_secret: 'cs_cs_1_1234567890abcdef1234567890abcdef1234567890abcdef',
            status: 'open',
            title: 'Acme Pro',
            description: null,
            success_url: 'https://merchant.test/success',
            cancel_url: 'https://merchant.test/cancel',
            expires_at: '2026-06-19T00:00:00.000Z',
            created_at: '2026-06-18T00:00:00.000Z',
            payment_order: {
              id: 'po_1',
              merchant_order_id: 'merchant_1',
              amount: '49.01',
              requested_amount: '49.00',
              settlement_asset: 'USDC',
              status: 'created',
              expires_at: '2026-06-19T00:00:00.000Z',
              created_at: '2026-06-18T00:00:00.000Z',
              accepted_assets: [{ chain: 'base-sepolia', asset: 'USDC' }],
              payment_instructions: [
                {
                  chain: 'base-sepolia',
                  asset: 'USDC',
                  address: '0x1111111111111111111111111111111111111111',
                },
              ],
            },
          },
          { status: 201 },
        )
      }),
    )

    const api = new CheckoutSessionsApi(
      new HttpClient({ baseUrl: BASE_URL }),
      { checkoutBaseUrl: 'https://checkout.test' },
    )
    const session = await api.create(
      {
        merchantOrderId: 'merchant_1',
        amount: '49.00',
        amountMode: 'auto',
        acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
        title: 'Acme Pro',
        successUrl: 'https://merchant.test/success',
        cancelUrl: 'https://merchant.test/cancel',
        metadata: { plan: 'pro' },
        expiresAt: '2026-12-31T00:00:00.000Z',
      },
      { idempotencyKey: 'merchant_1' },
    )

    expect(idempotencyKey).toBe('merchant_1')
    expect(session).toMatchObject({
      id: 'cs_1',
      clientSecret: 'cs_cs_1_1234567890abcdef1234567890abcdef1234567890abcdef',
      url: 'https://checkout.test/c/cs_1?client_secret=cs_cs_1_1234567890abcdef1234567890abcdef1234567890abcdef',
      status: 'open',
      paymentOrder: {
        id: 'po_1',
        merchantOrderId: 'merchant_1',
        requestedAmount: '49.00',
      },
    })
  })
})
