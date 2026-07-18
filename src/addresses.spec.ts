import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { AddressesApi } from './addresses'
import { HttpClient } from './http'

const BASE_URL = 'https://api.test.local'
const ADDRESSES = `${BASE_URL}/v1/addresses`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function api(): AddressesApi {
  return new AddressesApi(new HttpClient({ baseUrl: BASE_URL }))
}

describe('AddressesApi', () => {
  it('list：映射 created_at → createdAt、has_more → hasMore', async () => {
    server.use(
      http.get(ADDRESSES, () =>
        HttpResponse.json({
          items: [
            {
              id: 'addr_1',
              chain: 'base',
              address: '0xabc',
              label: 'ops',
              mode: 'single',
              status: 'available',
              created_at: '2026-07-01T00:00:00.000Z',
            },
          ],
          has_more: true,
        }),
      ),
    )

    const result = await api().list()

    expect(result).toEqual({
      items: [
        {
          id: 'addr_1',
          chain: 'base',
          address: '0xabc',
          label: 'ops',
          mode: 'single',
          status: 'available',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      hasMore: true,
    })
    expect(result.items[0]).not.toHaveProperty('created_at')
  })

  it('list：offset=0 等 0 值查询参数不被丢弃', async () => {
    let search = ''
    server.use(
      http.get(ADDRESSES, ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json({ items: [], has_more: false })
      }),
    )

    await api().list({ chain: 'base', status: 'available', limit: 50, offset: 0 })

    const params = new URLSearchParams(search)
    expect(params.get('chain')).toBe('base')
    expect(params.get('status')).toBe('available')
    expect(params.get('limit')).toBe('50')
    expect(params.get('offset')).toBe('0')
  })

  it('import：请求体逐地址展开，响应映射为 camelCase', async () => {
    let body: unknown
    server.use(
      http.post(`${ADDRESSES}/import`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          imported: 2,
          addresses: [
            {
              id: 'addr_1',
              chain: 'base',
              address: '0xaaa',
              label: 'batch',
              mode: 'shared',
              status: 'available',
              created_at: '2026-07-01T00:00:00.000Z',
            },
            {
              id: 'addr_2',
              chain: 'base',
              address: '0xbbb',
              label: 'batch',
              mode: 'shared',
              status: 'available',
              created_at: '2026-07-01T00:00:00.000Z',
            },
          ],
        })
      }),
    )

    const result = await api().import({
      chain: 'base',
      addresses: ['0xaaa', '0xbbb'],
      label: 'batch',
      mode: 'shared',
    })

    expect(body).toEqual({
      addresses: [
        { chain: 'base', address: '0xaaa', label: 'batch' },
        { chain: 'base', address: '0xbbb', label: 'batch' },
      ],
      mode: 'shared',
    })
    expect(result.imported).toBe(2)
    expect(result.addresses.map((addr) => addr.createdAt)).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ])
  })

  it('update：返回单条地址的 camelCase 映射', async () => {
    server.use(
      http.patch(`${ADDRESSES}/addr_1`, () =>
        HttpResponse.json({
          id: 'addr_1',
          chain: 'base',
          address: '0xabc',
          label: null,
          mode: 'single',
          status: 'disabled',
          created_at: '2026-07-01T00:00:00.000Z',
        }),
      ),
    )

    const updated = await api().update('addr_1', { status: 'disabled', label: null })

    expect(updated).toMatchObject({ id: 'addr_1', status: 'disabled', createdAt: '2026-07-01T00:00:00.000Z' })
  })
})
