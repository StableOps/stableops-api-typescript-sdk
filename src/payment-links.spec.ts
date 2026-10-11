import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { StableOps } from './index'

const BASE_URL = 'https://api.test.local'
const server = setupServer()
const wireLink = {
  id: 'pl_1',
  slug: 'demo',
  title: 'Demo',
  description: null,
  amount: '10.00',
  amount_mode: 'auto',
  settlement_asset: null,
  accepted_assets: [{ chain: 'base-sepolia', asset: 'USDC' }],
  success_url: null,
  cancel_url: null,
  walletconnect_project_id: null,
  expires_in_minutes: 25,
  payer_fields: ['email'],
  status: 'active',
  checkout_count: 3,
  created_at: '2026-10-11T00:00:00.000Z',
  updated_at: '2026-10-11T00:00:00.000Z',
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('支付链接接口', () => {
  it('创建时省略未填写的字段，并保留付款人字段和期限', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/payment-links`, async ({ request }) => {
        expect(await request.json()).toEqual({
          title: 'Demo',
          amount: '10.00',
          amount_mode: 'auto',
          accepted_assets: [{ chain: 'base-sepolia', asset: 'USDC' }],
          expires_in_minutes: 25,
          payer_fields: ['email'],
        })
        return HttpResponse.json(wireLink)
      }),
    )
    await expect(
      new StableOps({ baseUrl: BASE_URL }).paymentLinks.create({
        title: 'Demo',
        amount: '10.00',
        amountMode: 'auto',
        acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
        expiresInMinutes: 25,
        payerFields: ['email'],
      }),
    ).resolves.toMatchObject({
      slug: 'demo',
      settlementAsset: null,
      expiresInMinutes: 25,
      payerFields: ['email'],
      checkoutCount: 3,
    })
  })

  it('更新时保留显式空值，仅提交填写的字段', async () => {
    server.use(
      http.patch(`${BASE_URL}/v1/payment-links/pl%2F1`, async ({ request }) => {
        expect(await request.json()).toEqual({
          description: null,
          success_url: null,
          payer_fields: [],
        })
        return HttpResponse.json({ ...wireLink, payer_fields: [] })
      }),
    )
    await new StableOps({ baseUrl: BASE_URL }).paymentLinks.update('pl/1', {
      description: null,
      successUrl: null,
      payerFields: [],
    })
  })

  it('查询链接及关联订单时保留分页、付款人和交易信息', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/payment-links`, ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          limit: '5',
          offset: '5',
        })
        return HttpResponse.json({ items: [wireLink], total: 12, has_more: true })
      }),
      http.get(`${BASE_URL}/v1/payment-links/pl_1/orders`, ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          status: 'finalized',
          limit: '5',
          offset: '0',
        })
        return HttpResponse.json({
          link: wireLink,
          total: 1,
          has_more: false,
          completed: 1,
          items: [
            {
              id: 'po_1',
              merchant_order_id: 'merchant_1',
              amount: '10.005',
              status: 'finalized',
              created_at: wireLink.created_at,
              payer: { email: 'payer@example.com' },
              payments: [
                { chain: 'base-sepolia', asset: 'USDC', amount: '10.005', tx_hash: '0xtx' },
              ],
            },
          ],
        })
      }),
    )
    const api = new StableOps({ baseUrl: BASE_URL }).paymentLinks
    expect(await api.listPage({ limit: 5, offset: 5 })).toMatchObject({ total: 12, hasMore: true })
    expect(await api.orders('pl_1', { status: 'finalized', limit: 5, offset: 0 })).toMatchObject({
      total: 1,
      hasMore: false,
      completed: 1,
      items: [
        {
          merchantOrderId: 'merchant_1',
          payer: { email: 'payer@example.com' },
          payments: [{ txHash: '0xtx', amount: '10.005' }],
        },
      ],
    })
  })

  it.each(['create', 'update'] as const)('失败的 %s 请求只发送一次', async (operation) => {
    let attempts = 0
    const fail = () => {
      attempts++
      return HttpResponse.json({ code: 'unavailable', message: 'unavailable' }, { status: 503 })
    }
    server.use(
      http.post(`${BASE_URL}/v1/payment-links`, fail),
      http.patch(`${BASE_URL}/v1/payment-links/pl_1`, fail),
    )
    const api = new StableOps({ baseUrl: BASE_URL, retry: { maxRetries: 3 } }).paymentLinks
    const request =
      operation === 'create'
        ? api.create({
            title: 'Demo',
            amount: '10.00',
            acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
          })
        : api.update('pl_1', { status: 'inactive' })
    await expect(request).rejects.toMatchObject({ status: 503 })
    expect(attempts).toBe(1)
  })
})
