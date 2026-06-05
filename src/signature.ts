import { createHmac, timingSafeEqual } from 'node:crypto'

// 与服务端 webhook 签名格式保持一致：
//   X-Product-Signature: t=<unix_ts>,v1=<hmac_sha256(t.rawBody)>
// SDK 内联实现，避免发布包依赖内部 workspace 包。

export const SIGNATURE_HEADER = 'X-Product-Signature'
export const EVENT_ID_HEADER = 'X-Event-Id'
export const DELIVERY_ID_HEADER = 'X-Delivery-Id'
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60

export type SignatureBuildInput = {
  secret: string
  timestamp: number
  rawBody: string
}

export type MultiSignatureBuildInput = {
  secrets: readonly string[]
  timestamp: number
  rawBody: string
}

export type VerifyInput = {
  secrets: readonly string[]
  header: string | undefined
  rawBody: string
  now?: number
  toleranceSeconds?: number
}

export type VerifyResult =
  | { ok: true; timestamp: number }
  | {
      ok: false
      reason:
        | 'missing_header'
        | 'invalid_format'
        | 'timestamp_expired'
        | 'bad_signature'
    }

export function buildSignatureHeader({
  secret,
  timestamp,
  rawBody,
}: SignatureBuildInput): string {
  return buildSignatureHeaderForSecrets({
    secrets: [secret],
    timestamp,
    rawBody,
  })
}

export function buildSignatureHeaderForSecrets({
  secrets,
  timestamp,
  rawBody,
}: MultiSignatureBuildInput): string {
  const payload = `${timestamp}.${rawBody}`
  const signatures = secrets
    .filter((secret) => secret.length > 0)
    .map((secret) => createHmac('sha256', secret).update(payload).digest('hex'))
  return `t=${timestamp},${signatures.map((signature) => `v1=${signature}`).join(',')}`
}

export function verifySignature(input: VerifyInput): VerifyResult {
  if (!input.header) return { ok: false, reason: 'missing_header' }
  const parsed = parseHeader(input.header)
  if (!parsed) return { ok: false, reason: 'invalid_format' }

  const now = input.now ?? Math.floor(Date.now() / 1000)
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return { ok: false, reason: 'timestamp_expired' }
  }

  const payload = `${parsed.timestamp}.${input.rawBody}`
  for (const secret of input.secrets) {
    if (!secret) continue
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    for (const signature of parsed.signatures) {
      if (safeEqualHex(expected, signature)) {
        return { ok: true, timestamp: parsed.timestamp }
      }
    }
  }
  return { ok: false, reason: 'bad_signature' }
}

function parseHeader(
  header: string,
): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null
  const signatures: string[] = []
  for (const segment of header.split(',')) {
    const [key, value] = segment.trim().split('=')
    if (!key || !value) continue
    if (key === 't') {
      const ts = Number(value)
      if (Number.isFinite(ts)) timestamp = ts
    } else if (key === 'v1') {
      signatures.push(value)
    }
  }
  if (timestamp === null || signatures.length === 0) return null
  return { timestamp, signatures }
}

function safeEqualHex(a: string, b: string): boolean {
  if (!isSha256Hex(a) || !isSha256Hex(b)) return false
  const aBuffer = Buffer.from(a, 'hex')
  const bBuffer = Buffer.from(b, 'hex')
  return timingSafeEqual(aBuffer, bBuffer)
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value)
}
