import type { HttpClient } from './http'
import type { CreateRefundInput, ListRefundsParams, Refund, RefundListPage } from './types'

export class RefundsApi {
  constructor(private readonly http: HttpClient) {}

  async create(input: CreateRefundInput): Promise<Refund> {
    return fromWire(
      await this.http.request<WireRefund>({
        method: 'POST',
        path: '/v1/refunds',
        body: {
          payment_order_id: input.paymentOrderId,
          amount: input.amount,
          destination_address: input.destinationAddress,
        },
      }),
    )
  }

  async retrieve(id: string): Promise<Refund> {
    return fromWire(
      await this.http.request<WireRefund>({
        method: 'GET',
        path: `/v1/refunds/${encodeURIComponent(id)}`,
      }),
    )
  }

  async list(params: ListRefundsParams = {}): Promise<Refund[]> {
    return (await this.listPage(params)).items
  }

  async listPage(params: ListRefundsParams = {}): Promise<RefundListPage> {
    const wire = await this.http.request<{ items: WireRefund[]; has_more: boolean; total: number }>(
      {
        method: 'GET',
        path: '/v1/refunds',
        query: {
          payment_order_id: params.paymentOrderId,
          status: params.status,
          limit: params.limit,
          offset: params.offset,
        },
      },
    )
    return { items: wire.items.map(fromWire), hasMore: wire.has_more, total: wire.total }
  }

  async submit(id: string, input: { txHash: string }): Promise<Refund> {
    return fromWire(
      await this.http.request<WireRefund>({
        method: 'POST',
        path: `/v1/refunds/${encodeURIComponent(id)}/submit`,
        body: { tx_hash: input.txHash },
      }),
    )
  }

  async cancel(id: string): Promise<Refund> {
    return fromWire(
      await this.http.request<WireRefund>({
        method: 'POST',
        path: `/v1/refunds/${encodeURIComponent(id)}/cancel`,
      }),
    )
  }
}

type WireRefund = {
  id: string
  payment_order_id: string
  source_payment_event_id: string
  chain: Refund['chain']
  asset: Refund['asset']
  amount: string
  amount_minor: string
  source_address: string
  destination_address: string
  status: Refund['status']
  tx_hash: string | null
  failure_reason: string | null
  submitted_at: string | null
  confirmed_at: string | null
  canceled_at: string | null
  created_at: string
  updated_at: string
}

function fromWire(wire: WireRefund): Refund {
  return {
    id: wire.id,
    paymentOrderId: wire.payment_order_id,
    sourcePaymentEventId: wire.source_payment_event_id,
    chain: wire.chain,
    asset: wire.asset,
    amount: wire.amount,
    amountMinor: wire.amount_minor,
    sourceAddress: wire.source_address,
    destinationAddress: wire.destination_address,
    status: wire.status,
    txHash: wire.tx_hash,
    failureReason: wire.failure_reason,
    submittedAt: wire.submitted_at,
    confirmedAt: wire.confirmed_at,
    canceledAt: wire.canceled_at,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}
