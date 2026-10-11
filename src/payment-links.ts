import type { HttpClient } from './http'
import type {
  CreatePaymentLinkInput,
  ListPaymentLinkOrdersParams,
  ListPaymentLinksParams,
  PaymentLink,
  PaymentLinkListPage,
  PaymentLinkOrder,
  PaymentLinkOrdersPage,
  UpdatePaymentLinkInput,
} from './types'

export class PaymentLinksApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreatePaymentLinkInput): Promise<PaymentLink> {
    return fromWire(
      await this.http.request<WirePaymentLink>({
        method: 'POST',
        path: '/v1/payment-links',
        body: {
          title: input.title,
          description: input.description,
          amount: input.amount,
          amount_mode: input.amountMode,
          settlement_asset: input.settlementAsset,
          accepted_assets: input.acceptedAssets,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          walletconnect_project_id: input.walletConnectProjectId,
          expires_in_minutes: input.expiresInMinutes,
          payer_fields: input.payerFields,
        },
      }),
    )
  }

  async list(params: ListPaymentLinksParams = {}): Promise<PaymentLink[]> {
    return (await this.listPage(params)).items
  }

  async listPage(params: ListPaymentLinksParams = {}): Promise<PaymentLinkListPage> {
    const wire = await this.http.request<{
      items: WirePaymentLink[]
      has_more: boolean
      total: number
    }>({
      method: 'GET',
      path: '/v1/payment-links',
      query: { limit: params.limit, offset: params.offset },
    })
    return { items: wire.items.map(fromWire), hasMore: wire.has_more, total: wire.total }
  }

  async update(id: string, input: UpdatePaymentLinkInput): Promise<PaymentLink> {
    return fromWire(
      await this.http.request<WirePaymentLink>({
        method: 'PATCH',
        path: `/v1/payment-links/${encodeURIComponent(id)}`,
        body: {
          title: input.title,
          description: input.description,
          status: input.status,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_in_minutes: input.expiresInMinutes,
          payer_fields: input.payerFields,
        },
      }),
    )
  }

  async orders(
    id: string,
    params: ListPaymentLinkOrdersParams = {},
  ): Promise<PaymentLinkOrdersPage> {
    const wire = await this.http.request<{
      link: WirePaymentLink
      items: WirePaymentLinkOrder[]
      total: number
      has_more: boolean
      completed: number
    }>({
      method: 'GET',
      path: `/v1/payment-links/${encodeURIComponent(id)}/orders`,
      query: { status: params.status, limit: params.limit, offset: params.offset },
    })
    return {
      link: fromWire(wire.link),
      items: wire.items.map((item) => ({
        id: item.id,
        merchantOrderId: item.merchant_order_id,
        amount: item.amount,
        status: item.status,
        createdAt: item.created_at,
        payer: item.payer,
        payments: item.payments.map((payment) => ({
          chain: payment.chain,
          asset: payment.asset,
          amount: payment.amount,
          txHash: payment.tx_hash,
        })),
      })),
      total: wire.total,
      hasMore: wire.has_more,
      completed: wire.completed,
    }
  }
}

type WirePaymentLink = {
  id: string
  slug: string
  title: string
  description: string | null
  amount: string
  amount_mode: PaymentLink['amountMode']
  settlement_asset: PaymentLink['settlementAsset']
  accepted_assets: PaymentLink['acceptedAssets']
  success_url: string | null
  cancel_url: string | null
  walletconnect_project_id: string | null
  expires_in_minutes: number
  payer_fields?: PaymentLink['payerFields']
  status: PaymentLink['status']
  checkout_count: number
  created_at: string
  updated_at: string
}

type WirePaymentLinkOrder = {
  id: string
  merchant_order_id: string
  amount: string
  status: PaymentLinkOrder['status']
  created_at: string
  payer: PaymentLinkOrder['payer']
  payments: {
    chain: string
    asset: PaymentLinkOrder['payments'][number]['asset']
    amount: string
    tx_hash: string
  }[]
}

function fromWire(wire: WirePaymentLink): PaymentLink {
  return {
    id: wire.id,
    slug: wire.slug,
    title: wire.title,
    description: wire.description,
    amount: wire.amount,
    amountMode: wire.amount_mode,
    settlementAsset: wire.settlement_asset,
    acceptedAssets: wire.accepted_assets,
    successUrl: wire.success_url,
    cancelUrl: wire.cancel_url,
    walletConnectProjectId: wire.walletconnect_project_id,
    expiresInMinutes: wire.expires_in_minutes,
    payerFields: wire.payer_fields,
    status: wire.status,
    checkoutCount: wire.checkout_count,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}
