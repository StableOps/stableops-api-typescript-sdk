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

export type AddressResponse = {
  id: string
  chain: string
  address: string
  label: string | null
  mode: AddressMode
  status: AddressStatus
  created_at: string
}

export type AddressListResponse = {
  items: AddressResponse[]
  has_more: boolean
}

export type ImportAddressInput = {
  chain: string
  addresses: string[]
  label?: string
  mode?: 'single' | 'shared'
}

export type ImportAddressResult = {
  imported: number
  addresses: AddressResponse[]
}

export type ListAddressParams = {
  chain?: string
  status?: AddressStatus
  limit?: number
  offset?: number
}

export type UpdateAddressInput = {
  label?: string | null
  mode?: 'single' | 'shared'
  status?: 'available' | 'reserved' | 'disabled'
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
    const wire = await this.http.request<ImportAddressResult>({
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
    return wire
  }

  async list(params: ListAddressParams = {}): Promise<AddressListResponse> {
    const wire = await this.http.request<AddressListResponse>({
      method: 'GET',
      path: '/v1/addresses',
      query: {
        ...(params.chain ? { chain: params.chain } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...(params.offset ? { offset: params.offset } : {}),
      },
    })
    return wire
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const wire = await this.http.request<{ success: boolean }>({
      method: 'DELETE',
      path: `/v1/addresses/${encodeURIComponent(id)}`,
    })
    return wire
  }

  async update(id: string, body: UpdateAddressInput): Promise<AddressResponse> {
    const wire = await this.http.request<AddressResponse>({
      method: 'PATCH',
      path: `/v1/addresses/${encodeURIComponent(id)}`,
      body,
    })
    return wire
  }
}
