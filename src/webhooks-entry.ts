import {
  verifySignature as verifySignatureWithSecrets,
  type VerifyInput,
  type VerifyResult,
} from './signature'

export {
  buildSignatureHeader,
  buildSignatureHeaderForSecrets,
  SIGNATURE_HEADER,
  EVENT_ID_HEADER,
  DELIVERY_ID_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
} from './signature'
export type {
  SignatureBuildInput,
  MultiSignatureBuildInput,
  VerifyResult,
} from './signature'

export type WebhookVerifyInput = Omit<VerifyInput, 'secrets'> &
  (
    | { secret: string | readonly string[]; secrets?: never }
    | { secrets: readonly string[]; secret?: never }
  )

export function verifySignature(input: WebhookVerifyInput): VerifyResult {
  const secrets =
    'secret' in input
      ? Array.isArray(input.secret)
        ? input.secret
        : [input.secret as string]
      : input.secrets

  return verifySignatureWithSecrets({
    secrets,
    header: input.header,
    rawBody: input.rawBody,
    toleranceSeconds: input.toleranceSeconds,
    now: input.now,
  })
}

export class WebhooksApi {
  verify(input: WebhookVerifyInput): VerifyResult {
    return verifySignature(input)
  }
}
