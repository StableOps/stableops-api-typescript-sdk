import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpClient } from './http'
import { EventsApi, PaymentOrdersApi } from './payment-orders'

const BASE_URL = 'https://api.test.local'
const ORDERS = `${BASE_URL}/v1/payment-orders`
const EVENTS = `${BASE_URL}/v1/events`

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

describe('EventsApi', () => {
  it('映射完整过滤参数并返回事件列表', async () => {
    let requestUrl = ''
    server.use(
      http.get(EVENTS, ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json({ items: [] })
      }),
    )

    const api = new EventsApi(new HttpClient({ baseUrl: BASE_URL }))
    await api.list({
      chain: 'base',
      asset: 'USDC',
      paymentOrderId: 'po_1',
      toAddress: '0xabc',
      txHash: '0xtx',
      limit: 25,
    })

    const query = new URL(requestUrl).searchParams
    expect(query.get('chain')).toBe('base')
    expect(query.get('asset')).toBe('USDC')
    expect(query.get('payment_order_id')).toBe('po_1')
    expect(query.get('to_address')).toBe('0xabc')
    expect(query.get('tx_hash')).toBe('0xtx')
    expect(query.get('limit')).toBe('25')
  })

  it('把事件详情响应映射为 camelCase', async () => {
    server.use(
      http.get(`${EVENTS}/evt_1`, () =>
        HttpResponse.json({
          id: 'evt_1',
          chain: 'base',
          asset: 'USDC',
          from_address: '0xfrom',
          to_address: '0xto',
          amount: '12.5',
          tx_hash: '0xtx',
          log_index: 1,
          block_number: '123',
          payment_order_id: 'po_1',
          confirmations: 8,
          detected_at: '2026-06-01T00:00:00.000Z',
          raw_chain_event: {
            id: 'raw_1',
            source: 'rpc',
            block_hash: '0xblock',
            received_at: '2026-06-01T00:00:01.000Z',
            payload: { log: 1 },
          },
          payment_order: {
            id: 'po_1',
            merchant_order_id: 'merchant_1',
            status: 'confirmed',
            settlement_asset: 'USDC',
            amount: '12.5',
          },
          deliveries: [
            {
              id: 'del_1',
              webhook_endpoint_id: 'we_1',
              event_type: 'payment.confirmed',
              status: 'succeeded',
              attempts: 1,
              response_status: 200,
              error_message: null,
              last_attempt_at: '2026-06-01T00:00:02.000Z',
              created_at: '2026-06-01T00:00:01.000Z',
            },
          ],
        }),
      ),
    )

    const api = new EventsApi(new HttpClient({ baseUrl: BASE_URL }))
    const event = await api.retrieve('evt_1')

    expect(event.rawChainEvent).toEqual({
      id: 'raw_1',
      source: 'rpc',
      blockHash: '0xblock',
      receivedAt: '2026-06-01T00:00:01.000Z',
      payload: { log: 1 },
    })
    expect(event.paymentOrder?.merchantOrderId).toBe('merchant_1')
    expect(event.deliveries[0]).toMatchObject({
      webhookEndpointId: 'we_1',
      eventType: 'payment.confirmed',
      responseStatus: 200,
    })
  })
})
