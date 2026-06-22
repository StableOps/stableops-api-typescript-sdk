import { describe, expect, it } from 'vitest'

import { buildSignatureHeader, verifySignature, WebhooksApi } from './webhooks-entry'

describe('webhooks entry', () => {
  it('支持 secret 和 secrets 两种验签输入', () => {
    const timestamp = 1_780_000_000
    const rawBody = '{"type":"payment.confirmed"}'
    const header = buildSignatureHeader({
      secret: 'whsec_test',
      timestamp,
      rawBody,
    })

    expect(
      verifySignature({
        secret: 'whsec_test',
        header,
        rawBody,
        now: timestamp,
      }),
    ).toEqual({ ok: true, timestamp })
    expect(
      new WebhooksApi().verify({
        secrets: ['whsec_old', 'whsec_test'],
        header,
        rawBody,
        now: timestamp,
      }),
    ).toEqual({ ok: true, timestamp })
  })
})
