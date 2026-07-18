import type { HttpClient } from './http'

export type AddressPool = {
  chain: string
  available: number
  allocated: number
  total: number
  threshold: number
}

export type AddressStatus = 'available' | 'allocated' | 'reserved' | 'disabled'

export type AddressMode = 'single' | 'shared'

export type Address = {
  id: string
  chain: string
  address: string
  label: string | null
  mode: AddressMode
  status: AddressStatus
  createdAt: string
}

export type AddressList = {
  items: Address[]
  hasMore: boolean
}

export type ImportAddressInput = {
  chain: string
  addresses: string[]
  label?: string
  mode?: AddressMode
}

export type ImportAddressResult = {
  imported: number
  addresses: Address[]
}

export type ListAddressParams = {
  chain?: string
  status?: AddressStatus
  limit?: number
  offset?: number
}

export type UpdateAddressInput = {
  label?: string | null
  mode?: AddressMode
  status?: 'available' | 'reserved' | 'disabled'
}

type WireAddress = {
  id: string
  chain: string
  address: string
  label: string | null
  mode: AddressMode
  status: AddressStatus
  created_at: string
}

export class AddressesApi {
  constructor(private readonly http: HttpClient) {}

  async getPools(): Promise<AddressPool[]> {
    const wire = await this.http.request<{ pools: AddressPool[] }>({
      method: 'GET',
      path: '/v1/addresses/pools',
    })
    return wire.pools
  }

  async import(input: ImportAddressInput): Promise<ImportAddressResult> {
    const wire = await this.http.request<{ imported: number; addresses: WireAddress[] }>({
      method: 'POST',
      path: '/v1/addresses/import',
      body: {
        addresses: input.addresses.map((addr) => ({
          chain: input.chain,
          address: addr,
          ...(input.label ? { label: input.label } : {}),
        })),
        mode: input.mode ?? 'single',
      },
    })
    return {
      imported: wire.imported,
      addresses: wire.addresses.map(fromWire),
    }
  }

  async list(params: ListAddressParams = {}): Promise<AddressList> {
    const wire = await this.http.request<{ items: WireAddress[]; has_more: boolean }>({
      method: 'GET',
      path: '/v1/addresses',
      query: {
        chain: params.chain,
        status: params.status,
        limit: params.limit,
        offset: params.offset,
      },
    })
    return {
      items: wire.items.map(fromWire),
      hasMore: wire.has_more,
    }
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const wire = await this.http.request<{ success: boolean }>({
      method: 'DELETE',
      path: `/v1/addresses/${encodeURIComponent(id)}`,
    })
    return wire
  }

  async update(id: string, body: UpdateAddressInput): Promise<Address> {
    const wire = await this.http.request<WireAddress>({
      method: 'PATCH',
      path: `/v1/addresses/${encodeURIComponent(id)}`,
      body,
    })
    return fromWire(wire)
  }
}

function fromWire(wire: WireAddress): Address {
  return {
    id: wire.id,
    chain: wire.chain,
    address: wire.address,
    label: wire.label,
    mode: wire.mode,
    status: wire.status,
    createdAt: wire.created_at,
  }
}
