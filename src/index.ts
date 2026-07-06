import { AddressesApi } from './addresses'
import { HttpClient, type ClientOptions } from './http'
import { MerchantPortalApi, MerchantSubscriptionsApi } from './merchant-subscriptions'
import { CheckoutSessionsApi, PaymentOrdersApi } from './payment-orders'
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
  private readonly options: StableOpsOptions
  readonly addresses: AddressesApi
  readonly merchantSubscriptions: MerchantSubscriptionsApi
  readonly paymentOrders: PaymentOrdersApi
  readonly checkoutSessions: CheckoutSessionsApi
  readonly webhooks: WebhooksApi

  constructor(options: StableOpsOptions = {}) {
    this.options = options
    const http = new HttpClient(options)
    this.addresses = new AddressesApi(http)
    this.merchantSubscriptions = new MerchantSubscriptionsApi(http)
    this.paymentOrders = new PaymentOrdersApi(http)
    this.checkoutSessions = new CheckoutSessionsApi(http, {
      checkoutBaseUrl: options.checkoutBaseUrl,
    })
    this.webhooks = new WebhooksApi(http)
  }

  portal(portalToken: string): MerchantPortalApi {
    return new MerchantPortalApi(
      new HttpClient({
        apiKey: portalToken,
        baseUrl: this.options.baseUrl,
        fetch: this.options.fetch,
        timeoutMs: this.options.timeoutMs,
        retry: this.options.retry,
        debug: this.options.debug,
        _sleep: this.options._sleep,
        _random: this.options._random,
        _now: this.options._now,
      }),
      { checkoutBaseUrl: this.options.checkoutBaseUrl },
    )
  }
}
