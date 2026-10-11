import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { StableOps } from './index'

const BASE_URL = 'https://api.test.local'
const server = setupServer()
const wireRefund = {
  id: 'ref_1',
  payment_order_id: 'po_1',
  source_payment_event_id: 'evt_1',
  chain: 'base-sepolia',
  asset: 'USDC',
  amount: '2.50',
  amount_minor: '2500000',
  source_address: '0xmerchant',
  destination_address: '0xpayer',
  status: 'requested',
  tx_hash: null,
  failure_reason: null,
  submitted_at: null,
  confirmed_at: null,
  canceled_at: null,
  created_at: '2026-10-11T00:00:00.000Z',
  updated_at: '2026-10-11T00:00:00.000Z',
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('退款接口', () => {
  it('请求退款并保留资金来源、精确金额和空值', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/refunds`, async ({ request }) => {
        expect(await request.json()).toEqual({
          payment_order_id: 'po_1',
          amount: '2.50',
          destination_address: '0xpayer',
        })
        return HttpResponse.json(wireRefund, { status: 201 })
      }),
    )
    const client = new StableOps({ baseUrl: BASE_URL })
    await expect(
      client.refunds.create({
        paymentOrderId: 'po_1',
        amount: '2.50',
        destinationAddress: '0xpayer',
      }),
    ).resolves.toMatchObject({
      paymentOrderId: 'po_1',
      sourcePaymentEventId: 'evt_1',
      amountMinor: '2500000',
      sourceAddress: '0xmerchant',
      destinationAddress: '0xpayer',
      txHash: null,
      confirmedAt: null,
    })
  })

  it('按订单和状态筛选，并返回完整分页信息', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/refunds`, ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          payment_order_id: 'po_1',
          status: 'requested',
          limit: '10',
          offset: '10',
        })
        return HttpResponse.json({ items: [wireRefund], total: 21, has_more: true })
      }),
    )
    const page = await new StableOps({ baseUrl: BASE_URL }).refunds.listPage({
      paymentOrderId: 'po_1',
      status: 'requested',
      limit: 10,
      offset: 10,
    })
    expect(page).toMatchObject({ items: [{ id: 'ref_1' }], total: 21, hasMore: true })
  })

  it('读取、提交和取消退款时正确编码编号', async () => {
    const path = `${BASE_URL}/v1/refunds/ref%2F1`
    server.use(
      http.get(path, () => HttpResponse.json(wireRefund)),
      http.post(`${path}/submit`, async ({ request }) => {
        expect(await request.json()).toEqual({ tx_hash: '0xtx' })
        return HttpResponse.json({ ...wireRefund, status: 'submitted', tx_hash: '0xtx' })
      }),
      http.post(`${path}/cancel`, () => HttpResponse.json({ ...wireRefund, status: 'canceled' })),
    )
    const api = new StableOps({ baseUrl: BASE_URL }).refunds
    expect((await api.retrieve('ref/1')).id).toBe('ref_1')
    expect((await api.submit('ref/1', { txHash: '0xtx' })).txHash).toBe('0xtx')
    expect((await api.cancel('ref/1')).status).toBe('canceled')
  })

  it.each(['create', 'submit', 'cancel'] as const)(
    '失败的 %s 请求只发送一次',
    async (operation) => {
      let attempts = 0
      server.use(
        http.post(`${BASE_URL}/v1/refunds*`, () => {
          attempts++
          return HttpResponse.json({ code: 'unavailable', message: 'unavailable' }, { status: 503 })
        }),
      )
      const api = new StableOps({ baseUrl: BASE_URL, retry: { maxRetries: 3 } }).refunds
      const request =
        operation === 'create'
          ? api.create({ paymentOrderId: 'po_1', amount: '2.50', destinationAddress: '0xpayer' })
          : operation === 'submit'
            ? api.submit('ref_1', { txHash: '0xtx' })
            : api.cancel('ref_1')
      await expect(request).rejects.toMatchObject({ status: 503 })
      expect(attempts).toBe(1)
    },
  )
})
