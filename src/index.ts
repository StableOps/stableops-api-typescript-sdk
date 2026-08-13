import { AddressesApi } from './addresses'
import { AgentsApi } from './agents'
import { HttpClient, type ClientOptions } from './http'
import { MerchantPortalApi, MerchantSubscriptionsApi } from './merchant-subscriptions'
import { CheckoutSessionsApi, PaymentOrdersApi } from './payment-orders'
import { WebhooksApi } from './webhooks'

export * from './types'
export type {
  Address,
  AddressList,
  AddressMode,
  AddressPool,
  AddressStatus,
  ImportAddressInput,
  ImportAddressResult,
  ListAddressParams,
  UpdateAddressInput,
} from './addresses'
export type { ListPaymentOrdersParams, PaymentOrderListPage } from './payment-orders'
export type {
  ListWebhookDeliveriesParams,
  ListWebhookEndpointsParams,
  WebhookDeliveryListPage,
  WebhookEndpointListPage,
} from './webhooks'
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
  readonly agents: AgentsApi

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
    this.agents = new AgentsApi(http)
  }

  portal(portalToken: string): MerchantPortalApi {
    // spread 复用全部客户端配置（含未来新增字段），仅替换鉴权凭证为 portal token。
    // HttpClient 会忽略多余的 checkoutBaseUrl 字段。
    return new MerchantPortalApi(new HttpClient({ ...this.options, apiKey: portalToken }), {
      checkoutBaseUrl: this.options.checkoutBaseUrl,
    })
  }
}
