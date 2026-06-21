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
