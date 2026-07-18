import { describe, expect, it } from 'vitest'

import { buildSignatureHeader, buildSignatureHeaderForSecrets, verifySignature, WebhooksApi } from './webhooks-entry'

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

  it('secret 显式为 undefined 时回落到 secrets（纯 JS 调用方场景）', () => {
    const timestamp = 1_780_000_000
    const rawBody = '{"type":"payment.confirmed"}'
    const header = buildSignatureHeader({ secret: 'whsec_test', timestamp, rawBody })

    // TS 类型不允许同时给 secret / secrets，但 JS 调用方可能这么传：不应误报 bad_signature。
    const input = {
      secret: undefined,
      secrets: ['whsec_test'],
      header,
      rawBody,
      now: timestamp,
    } as unknown as Parameters<typeof verifySignature>[0]
    expect(verifySignature(input)).toEqual({ ok: true, timestamp })
  })

  it('没有任何非空 secret 时构造签名头直接抛错', () => {
    expect(() =>
      buildSignatureHeaderForSecrets({ secrets: [], timestamp: 1, rawBody: '{}' }),
    ).toThrow(/non-empty secret/u)
    expect(() =>
      buildSignatureHeaderForSecrets({ secrets: ['', ''], timestamp: 1, rawBody: '{}' }),
    ).toThrow(/non-empty secret/u)
    expect(() => buildSignatureHeader({ secret: '', timestamp: 1, rawBody: '{}' })).toThrow(
      /non-empty secret/u,
    )
  })
})
