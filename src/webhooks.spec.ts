import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HttpClient } from './http'
import { WebhooksApi } from './webhooks'

const BASE_URL = 'https://api.test.local'
const ENDPOINTS = `${BASE_URL}/v1/webhook-endpoints`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('WebhooksApi', () => {
  it('创建端点时发送 redact_metadata 并映射响应字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(ENDPOINTS, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json(
          {
            id: 'we_1',
            url: 'https://example.com/hooks',
            description: null,
            enabled_events: ['payment.confirmed'],
            redact_metadata: true,
            disabled_at: null,
            created_at: '2026-06-01T00:00:00.000Z',
            secret: 'whsec_1',
          },
          { status: 201 },
        )
      }),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))
    const endpoint = await api.createEndpoint({
      url: 'https://example.com/hooks',
      enabledEvents: ['payment.confirmed'],
      redactMetadata: true,
    })

    expect(requestBody).toMatchObject({ redact_metadata: true })
    expect(endpoint.redactMetadata).toBe(true)
  })

  it('更新端点时映射 camelCase 请求与响应', async () => {
    let requestBody: unknown
    server.use(
      http.patch(`${ENDPOINTS}/we_1`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          id: 'we_1',
          url: 'https://example.com/hooks',
          description: 'updated',
          enabled_events: ['payment.finalized'],
          redact_metadata: false,
          disabled_at: null,
          created_at: '2026-06-01T00:00:00.000Z',
        })
      }),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))
    const endpoint = await api.updateEndpoint('we_1', {
      description: 'updated',
      enabledEvents: ['payment.finalized'],
      redactMetadata: false,
    })

    expect(requestBody).toEqual({
      description: 'updated',
      enabled_events: ['payment.finalized'],
      redact_metadata: false,
    })
    expect(endpoint).toMatchObject({
      description: 'updated',
      enabledEvents: ['payment.finalized'],
      redactMetadata: false,
    })
  })

  it('返回端点分页元数据并支持删除端点', async () => {
    server.use(
      http.get(ENDPOINTS, ({ request }) => {
        expect(new URL(request.url).searchParams.get('offset')).toBe('20')
        return HttpResponse.json({ items: [], has_more: true, total: 21 })
      }),
      http.delete(`${ENDPOINTS}/we_1`, () => HttpResponse.json({ success: true })),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))

    await expect(api.listEndpointsPage({ limit: 20, offset: 20 })).resolves.toEqual({
      items: [],
      hasMore: true,
      total: 21,
    })
    await expect(api.removeEndpoint('we_1')).resolves.toEqual({ success: true })
  })

  it('按 event id 重放到指定端点', async () => {
    let requestBody: unknown
    server.use(
      http.post(`${ENDPOINTS}/we_1/replay`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({ deliveryId: 'del_replay' })
      }),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))
    const result = await api.replay('we_1', 'evt_1')

    expect(requestBody).toEqual({ event_id: 'evt_1' })
    expect(result).toEqual({ deliveryId: 'del_replay' })
  })

  it('映射列表过滤参数和 delivery 响应', async () => {
    let requestUrl = ''
    server.use(
      http.get(`${BASE_URL}/v1/webhook-deliveries`, ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json({
          items: [
            {
              id: 'del_1',
              webhook_endpoint_id: 'we_1',
              event_id: 'evt_1',
              event_type: 'payment.confirmed',
              payment_order_id: 'po_1',
              status: 'succeeded',
              attempts: 1,
              response_status: 200,
              response_duration_ms: 42,
              error_message: null,
              next_retry_at: null,
              last_attempt_at: '2026-06-01T00:00:00.000Z',
              succeeded_at: '2026-06-01T00:00:00.000Z',
              dead_lettered_at: null,
              created_at: '2026-06-01T00:00:00.000Z',
            },
          ],
          has_more: false,
          total: 1,
        })
      }),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))
    const deliveries = await api.listDeliveries({
      status: 'succeeded',
      endpointId: 'we_1',
      paymentOrderId: 'po_1',
      limit: 10,
    })

    const query = new URL(requestUrl).searchParams
    expect(query.get('endpoint_id')).toBe('we_1')
    expect(query.get('payment_order_id')).toBe('po_1')
    expect(deliveries[0]).toMatchObject({
      webhookEndpointId: 'we_1',
      eventId: 'evt_1',
      responseDurationMs: 42,
    })
  })

  it('返回投递分页元数据和 offset', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/webhook-deliveries`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('offset')).toBe('40')
        return HttpResponse.json({ items: [], has_more: true, total: 99 })
      }),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))
    await expect(api.listDeliveriesPage({ limit: 20, offset: 40 })).resolves.toEqual({
      items: [],
      hasMore: true,
      total: 99,
    })
  })

  it('支持单条和 DLQ 批量重放', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/webhook-deliveries/del_1/replay`, () =>
        HttpResponse.json({ deliveryId: 'del_2' }),
      ),
      http.post(`${BASE_URL}/v1/webhook-deliveries/replay-dead-letters`, () =>
        HttpResponse.json({
          replayed: 1,
          items: [{ original_id: 'del_1', delivery_id: 'del_3' }],
        }),
      ),
    )

    const api = new WebhooksApi(new HttpClient({ baseUrl: BASE_URL }))

    await expect(api.replayDelivery('del_1')).resolves.toEqual({ deliveryId: 'del_2' })
    await expect(api.replayDeadLetters({ endpointId: 'we_1', limit: 20 })).resolves.toEqual({
      replayed: 1,
      items: [{ originalId: 'del_1', deliveryId: 'del_3' }],
    })
  })
})
