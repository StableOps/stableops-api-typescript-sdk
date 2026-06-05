import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpClient } from './http'
import { PaymentOrdersApi } from './payment-orders'

const BASE_URL = 'https://api.test.local'
const ORDERS = `${BASE_URL}/v1/payment-orders`

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
          scenario: 'generic',
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
        settlementAsset: 'USDC',
        acceptedAssets: [
          { chain: 'base', asset: 'USDC' },
          { chain: 'tron', asset: 'USDT' },
        ],
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
