import type { HttpClient } from './http'
import type {
  AgentAction,
  AgentPage,
  AgentPolicy,
  AgentSession,
  CreateAgentSessionInput,
  MarkAgentActionExecutedInput,
  RequestAgentActionInput,
  RequestAgentActionResult,
  UpsertAgentPolicyInput,
} from './types'

export class AgentsApi {
  constructor(private readonly http: HttpClient) {}

  async createSession(input: CreateAgentSessionInput = {}): Promise<AgentSession> {
    const wire = await this.http.request<WireAgentSession>({
      method: 'POST',
      path: '/v1/agent/sessions',
      body: { label: input.label, expires_at: input.expiresAt },
    })
    return fromWireSession(wire)
  }

  async listSessions(
    params: { limit?: number; offset?: number } = {},
  ): Promise<AgentPage<AgentSession>> {
    const wire = await this.http.request<WireAgentPage<WireAgentSession>>({
      method: 'GET',
      path: '/v1/agent/sessions',
      query: {
        limit: params.limit,
        offset: params.offset,
      },
    })
    return fromWirePage(wire, fromWireSession)
  }

  async revokeSession(id: string): Promise<AgentSession> {
    const wire = await this.http.request<WireAgentSession>({
      method: 'POST',
      path: `/v1/agent/sessions/${encodeURIComponent(id)}/revoke`,
    })
    return fromWireSession(wire)
  }

  async restoreSession(id: string): Promise<AgentSession> {
    const wire = await this.http.request<WireAgentSession>({
      method: 'POST',
      path: `/v1/agent/sessions/${encodeURIComponent(id)}/restore`,
    })
    return fromWireSession(wire)
  }

  async getPolicy(): Promise<AgentPolicy> {
    const wire = await this.http.request<WireAgentPolicy>({
      method: 'GET',
      path: '/v1/agent/policy',
    })
    return fromWirePolicy(wire)
  }

  async upsertPolicy(input: UpsertAgentPolicyInput): Promise<AgentPolicy> {
    const wire = await this.http.request<WireAgentPolicy>({
      method: 'POST',
      path: '/v1/agent/policy',
      body: {
        allowed_tools: input.allowedTools,
        require_approval: input.requireApproval,
      },
    })
    return fromWirePolicy(wire)
  }

  async requestAction(input: RequestAgentActionInput): Promise<RequestAgentActionResult> {
    return this.http.request<RequestAgentActionResult>({
      method: 'POST',
      path: '/v1/agent/actions',
      body: {
        agent_session_id: input.agentSessionId,
        tool: input.tool,
        input: input.input,
      },
    })
  }

  async listActions(
    params: { sessionId?: string; limit?: number; offset?: number } = {},
  ): Promise<AgentPage<AgentAction>> {
    const wire = await this.http.request<WireAgentPage<WireAgentAction>>({
      method: 'GET',
      path: '/v1/agent/actions',
      query: {
        session_id: params.sessionId,
        limit: params.limit,
        offset: params.offset,
      },
    })
    return fromWirePage(wire, fromWireAction)
  }

  async approveAction(id: string, input: { approverId?: string } = {}): Promise<AgentAction> {
    const wire = await this.http.request<WireAgentAction>({
      method: 'POST',
      path: `/v1/agent/actions/${encodeURIComponent(id)}/approve`,
      body: { approver_id: input.approverId },
    })
    return fromWireAction(wire)
  }

  async rejectAction(
    id: string,
    input: { approverId?: string; reason?: string } = {},
  ): Promise<AgentAction> {
    const wire = await this.http.request<WireAgentAction>({
      method: 'POST',
      path: `/v1/agent/actions/${encodeURIComponent(id)}/reject`,
      body: { approver_id: input.approverId, reason: input.reason },
    })
    return fromWireAction(wire)
  }

  async markExecuted(id: string, input: MarkAgentActionExecutedInput): Promise<AgentAction> {
    const wire = await this.http.request<WireAgentAction>({
      method: 'POST',
      path: `/v1/agent/actions/${encodeURIComponent(id)}/executed`,
      body: {
        agent_session_id: input.agentSessionId,
        result: input.result,
        error_message: input.errorMessage,
      },
    })
    return fromWireAction(wire)
  }
}

type WireAgentSession = {
  id: string
  label: string | null
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

type WireAgentPolicy = {
  id: string
  allowed_tools: string[]
  require_approval: boolean
  created_at: string
  updated_at: string
}

type WireAgentAction = {
  id: string
  agent_session_id: string
  tool: string
  input: unknown
  status: string
  approver_id: string | null
  decided_at: string | null
  executed_at: string | null
  result: unknown
  error_message: string | null
  created_at: string
}

type WireAgentPage<T> = { items: T[]; has_more: boolean; total: number }

function fromWireSession(wire: WireAgentSession): AgentSession {
  return {
    id: wire.id,
    label: wire.label,
    createdAt: wire.created_at,
    expiresAt: wire.expires_at,
    revokedAt: wire.revoked_at,
  }
}

function fromWirePolicy(wire: WireAgentPolicy): AgentPolicy {
  return {
    id: wire.id,
    allowedTools: wire.allowed_tools,
    requireApproval: wire.require_approval,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  }
}

function fromWireAction(wire: WireAgentAction): AgentAction {
  return {
    id: wire.id,
    agentSessionId: wire.agent_session_id,
    tool: wire.tool,
    input: wire.input,
    status: wire.status,
    approverId: wire.approver_id,
    decidedAt: wire.decided_at,
    executedAt: wire.executed_at,
    result: wire.result,
    errorMessage: wire.error_message,
    createdAt: wire.created_at,
  }
}

function fromWirePage<TWire, T>(
  wire: WireAgentPage<TWire>,
  fromWire: (item: TWire) => T,
): AgentPage<T> {
  return {
    items: wire.items.map(fromWire),
    hasMore: wire.has_more,
    total: wire.total,
  }
}
