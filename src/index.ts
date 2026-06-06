import { HttpClient, type ClientOptions } from './http'
import { EventsApi, PaymentOrdersApi } from './payment-orders'
import {
  WebhookDeliveriesApi,
  WebhookEndpointsApi,
} from './webhooks'

export * from './types'
export { StableOpsError, type ClientOptions, type RetryOptions } from './http'

export class StableOps {
  readonly paymentOrders: PaymentOrdersApi
  readonly events: EventsApi
  readonly webhookEndpoints: WebhookEndpointsApi
  readonly webhookDeliveries: WebhookDeliveriesApi

  constructor(options: ClientOptions = {}) {
    const http = new HttpClient(options)
    this.paymentOrders = new PaymentOrdersApi(http)
    this.events = new EventsApi(http)
    this.webhookEndpoints = new WebhookEndpointsApi(http)
    this.webhookDeliveries = new WebhookDeliveriesApi(http)
  }
}
