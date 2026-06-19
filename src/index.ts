import { HttpClient, type ClientOptions } from './http'
import {
  CheckoutSessionsApi,
  EventsApi,
  PaymentOrdersApi,
} from './payment-orders'
import {
  WebhookDeliveriesApi,
  WebhookEndpointsApi,
} from './webhooks'

export * from './types'
export {
  StableOpsError,
  maskSecret,
  type ClientOptions,
  type RetryOptions,
  type DebugEvent,
  type DebugLogger,
  type DebugOption,
} from './http'

export type StableOpsOptions = ClientOptions & {
  checkoutBaseUrl?: string
}

export class StableOps {
  readonly paymentOrders: PaymentOrdersApi
  readonly checkoutSessions: CheckoutSessionsApi
  readonly events: EventsApi
  readonly webhookEndpoints: WebhookEndpointsApi
  readonly webhookDeliveries: WebhookDeliveriesApi

  constructor(options: StableOpsOptions = {}) {
    const http = new HttpClient(options)
    this.paymentOrders = new PaymentOrdersApi(http)
    this.checkoutSessions = new CheckoutSessionsApi(http, {
      checkoutBaseUrl: options.checkoutBaseUrl,
    })
    this.events = new EventsApi(http)
    this.webhookEndpoints = new WebhookEndpointsApi(http)
    this.webhookDeliveries = new WebhookDeliveriesApi(http)
  }
}
