import { HttpClient, type ClientOptions } from './http'
import { EventsApi, PaymentOrdersApi } from './payment-orders'
import { WebhookEndpointsApi, WebhooksApi } from './webhooks'

export * from './types'
export { StableOpsError, type ClientOptions, type RetryOptions } from './http'
export { MockServer, type MockServerOptions } from './mock-server'
export {
  buildSignatureHeader,
  verifySignature,
  SIGNATURE_HEADER,
  EVENT_ID_HEADER,
  DELIVERY_ID_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
} from './signature'

export class StableOps {
  readonly paymentOrders: PaymentOrdersApi
  readonly events: EventsApi
  readonly webhookEndpoints: WebhookEndpointsApi
  readonly webhooks: WebhooksApi

  constructor(options: ClientOptions = {}) {
    const http = new HttpClient(options)
    this.paymentOrders = new PaymentOrdersApi(http)
    this.events = new EventsApi(http)
    this.webhookEndpoints = new WebhookEndpointsApi(http)
    this.webhooks = new WebhooksApi()
  }
}
