import { AddressesApi } from './addresses'
import { HttpClient, type ClientOptions } from './http'
import {
  CheckoutSessionsApi,
  PaymentOrdersApi,
} from './payment-orders'
import { WebhooksApi } from './webhooks'

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
  readonly addresses: AddressesApi
  readonly paymentOrders: PaymentOrdersApi
  readonly checkoutSessions: CheckoutSessionsApi
  readonly webhooks: WebhooksApi

  constructor(options: StableOpsOptions = {}) {
    const http = new HttpClient(options)
    this.addresses = new AddressesApi(http)
    this.paymentOrders = new PaymentOrdersApi(http)
    this.checkoutSessions = new CheckoutSessionsApi(http, {
      checkoutBaseUrl: options.checkoutBaseUrl,
    })
    this.webhooks = new WebhooksApi(http)
  }
}
