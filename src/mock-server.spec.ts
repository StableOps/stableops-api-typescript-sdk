import { afterEach, describe, expect, it } from 'vitest'

import { StableOps } from './index'
import { MockServer } from './mock-server'

describe('MockServer webhook contract', () => {
  let mock: MockServer | undefined

  afterEach(async () => {
    await mock?.close()
    mock = undefined
  })

  it('只在创建和轮换响应中暴露 secret', async () => {
    const secrets = ['secret_1', 'secret_2']
    mock = new MockServer({
      idFactory: () => 'we_1',
      secretFactory: () => secrets.shift() ?? 'fallback',
    })
    const { url } = await mock.listen()
    const client = new StableOps({ baseUrl: url })

    const created = await client.webhooks.createEndpoint({
      url: 'https://example.com/hooks',
      redactMetadata: true,
    })
    expect(created).toMatchObject({
      id: 'we_1',
      redactMetadata: true,
      secret: 'whsec_mock_secret_1',
    })

    const listed = await client.webhooks.listEndpoints()
    expect(listed[0]).not.toHaveProperty('secret')

    const updated = await client.webhooks.updateEndpoint('we_1', {
      description: 'updated',
      redactMetadata: false,
    })
    expect(updated).toMatchObject({
      description: 'updated',
      redactMetadata: false,
    })
    expect(updated).not.toHaveProperty('secret')

    const rotated = await client.webhooks.rotateSecret('we_1')
    expect(rotated.secret).toBe('whsec_mock_secret_2')

    const listedAfterRotation = await client.webhooks.listEndpoints()
    expect(listedAfterRotation[0]).not.toHaveProperty('secret')
  })
})

describe('MockServer payment order contract', () => {
  let mock: MockServer | undefined

  afterEach(async () => {
    await mock?.close()
    mock = undefined
  })

  const CREATE_INPUT = {
    merchantOrderId: 'm_1',
    amount: '10.00',
    acceptedAssets: [{ chain: 'base', asset: 'USDC' }] as { chain: 'base'; asset: 'USDC' }[],
    expiresAt: '2026-12-31T00:00:00.000Z',
  }

  it('幂等键复用：相同 body 重放原响应，不同 body 报 409', async () => {
    let seq = 0
    mock = new MockServer({ idFactory: () => `po_${++seq}` })
    const { url } = await mock.listen()
    const client = new StableOps({ baseUrl: url })

    const first = await client.paymentOrders.create(CREATE_INPUT, { idempotencyKey: 'key_1' })
    const replayed = await client.paymentOrders.create(CREATE_INPUT, { idempotencyKey: 'key_1' })
    expect(replayed.id).toBe(first.id)
    expect(mock.snapshot().orders).toHaveLength(1)

    await expect(
      client.paymentOrders.create(
        { ...CREATE_INPUT, amount: '99.00' },
        { idempotencyKey: 'key_1' },
      ),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('列表支持 status / limit 过滤，且最近创建的在前', async () => {
    let seq = 0
    mock = new MockServer({ idFactory: () => `po_${++seq}` })
    const { url } = await mock.listen()
    const client = new StableOps({ baseUrl: url })

    const a = await client.paymentOrders.create(CREATE_INPUT, { idempotencyKey: 'a' })
    const b = await client.paymentOrders.create(CREATE_INPUT, { idempotencyKey: 'b' })
    const c = await client.paymentOrders.create(CREATE_INPUT, { idempotencyKey: 'c' })
    await client.paymentOrders.cancel(a.id)

    const created = await client.paymentOrders.list({ status: 'created' })
    expect(created.map((order) => order.id)).toEqual([c.id, b.id])

    const limited = await client.paymentOrders.list({ limit: 1 })
    expect(limited.map((order) => order.id)).toEqual([c.id])
  })

  it('timeline 只出现在详情响应，创建 / 列表 / 取消不带', async () => {
    mock = new MockServer({ idFactory: () => 'po_1' })
    const { url } = await mock.listen()
    const client = new StableOps({ baseUrl: url })

    // SDK 会丢弃未知字段，wire 层形状用原始 fetch 断言。
    const rawCreated = (await (
      await fetch(`${url}/v1/payment-orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ merchant_order_id: 'm_1', amount: '10.00' }),
      })
    ).json()) as Record<string, unknown>
    expect(rawCreated).not.toHaveProperty('timeline')

    const rawList = (await (await fetch(`${url}/v1/payment-orders`)).json()) as {
      items: Record<string, unknown>[]
    }
    expect(rawList.items[0]).not.toHaveProperty('timeline')

    const rawDetail = (await (
      await fetch(`${url}/v1/payment-orders/po_1`)
    ).json()) as Record<string, unknown>
    expect(Array.isArray(rawDetail.timeline)).toBe(true)

    const rawCanceled = (await (
      await fetch(`${url}/v1/payment-orders/po_1/cancel`, { method: 'POST' })
    ).json()) as Record<string, unknown>
    expect(rawCanceled).not.toHaveProperty('timeline')

    const detail = await client.paymentOrders.retrieve('po_1')
    expect(detail.timeline).toHaveLength(2)
  })
})
