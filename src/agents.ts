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
    return this.http.request<AgentSession>({
      method: 'POST',
      path: '/v1/agent/sessions',
      body: { label: input.label, expires_at: input.expiresAt },
    })
  }

  async listSessions(params: { limit?: number; offset?: number } = {}): Promise<AgentPage<AgentSession>> {
    return this.http.request<AgentPage<AgentSession>>({
      method: 'GET',
      path: '/v1/agent/sessions',
      query: {
        limit: params.limit,
        offset: params.offset,
      },
    })
  }

  async revokeSession(id: string): Promise<AgentSession> {
    return this.http.request<AgentSession>({
      method: 'POST',
      path: `/v1/agent/sessions/${encodeURIComponent(id)}/revoke`,
    })
  }

  async restoreSession(id: string): Promise<AgentSession> {
    return this.http.request<AgentSession>({
      method: 'POST',
      path: `/v1/agent/sessions/${encodeURIComponent(id)}/restore`,
    })
  }

  async getPolicy(): Promise<AgentPolicy> {
    return this.http.request<AgentPolicy>({
      method: 'GET',
      path: '/v1/agent/policy',
    })
  }

  async upsertPolicy(input: UpsertAgentPolicyInput): Promise<AgentPolicy> {
    return this.http.request<AgentPolicy>({
      method: 'POST',
      path: '/v1/agent/policy',
      body: {
        allowed_tools: input.allowedTools,
        require_approval: input.requireApproval,
      },
    })
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
    return this.http.request<AgentPage<AgentAction>>({
      method: 'GET',
      path: '/v1/agent/actions',
      query: {
        session_id: params.sessionId,
        limit: params.limit,
        offset: params.offset,
      },
    })
  }

  async approveAction(id: string, input: { approverId?: string } = {}): Promise<AgentAction> {
    return this.http.request<AgentAction>({
      method: 'POST',
      path: `/v1/agent/actions/${encodeURIComponent(id)}/approve`,
      body: { approver_id: input.approverId },
    })
  }

  async rejectAction(
    id: string,
    input: { approverId?: string; reason?: string } = {},
  ): Promise<AgentAction> {
    return this.http.request<AgentAction>({
      method: 'POST',
      path: `/v1/agent/actions/${encodeURIComponent(id)}/reject`,
      body: { approver_id: input.approverId, reason: input.reason },
    })
  }

  async markExecuted(id: string, input: MarkAgentActionExecutedInput): Promise<AgentAction> {
    return this.http.request<AgentAction>({
      method: 'POST',
      path: `/v1/agent/actions/${encodeURIComponent(id)}/executed`,
      body: {
        agent_session_id: input.agentSessionId,
        result: input.result,
        error_message: input.errorMessage,
      },
    })
  }
}
