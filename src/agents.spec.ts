import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { AgentsApi } from './agents'
import { HttpClient } from './http'
import { StableOps } from './index'

const BASE_URL = 'https://api.test.local'
const SESSIONS = `${BASE_URL}/v1/agent/sessions`
const ACTIONS = `${BASE_URL}/v1/agent/actions`
const POLICY = `${BASE_URL}/v1/agent/policy`

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('AgentsApi', () => {
  it('创建 agent session 时映射 expiresAt 请求字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(SESSIONS, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          id: 'as_1',
          label: 'ops-bot',
          created_at: '2026-07-01T00:00:00.000Z',
          expires_at: null,
          revoked_at: null,
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const session = await api.createSession({ label: 'ops-bot' })

    expect(requestBody).toEqual({ label: 'ops-bot' })
    expect(session).toEqual({
      id: 'as_1',
      label: 'ops-bot',
      created_at: '2026-07-01T00:00:00.000Z',
      expires_at: null,
      revoked_at: null,
    })
  })

  it('列表 agent sessions 时映射分页参数', async () => {
    let requestUrl = ''
    server.use(
      http.get(SESSIONS, ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json({
          items: [
            {
              id: 'as_1',
              label: 'ops-bot',
              created_at: '2026-07-01T00:00:00.000Z',
              expires_at: null,
              revoked_at: null,
            },
          ],
          has_more: false,
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const sessions = await api.listSessions({ limit: 25, offset: 50 })

    const query = new URL(requestUrl).searchParams
    expect(query.get('limit')).toBe('25')
    expect(query.get('offset')).toBe('50')
    expect(sessions).toEqual({
      items: [
        {
          id: 'as_1',
          label: 'ops-bot',
          created_at: '2026-07-01T00:00:00.000Z',
          expires_at: null,
          revoked_at: null,
        },
      ],
      has_more: false,
    })
  })

  it('撤销 agent session 时请求 revoke endpoint', async () => {
    let called = false
    server.use(
      http.post(`${SESSIONS}/as_1/revoke`, () => {
        called = true
        return HttpResponse.json({
          id: 'as_1',
          label: 'ops-bot',
          created_at: '2026-07-01T00:00:00.000Z',
          expires_at: null,
          revoked_at: '2026-07-01T00:10:00.000Z',
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const session = await api.revokeSession('as_1')

    expect(called).toBe(true)
    expect(session.revoked_at).toBe('2026-07-01T00:10:00.000Z')
  })

  it('读取 agent policy 时请求 policy endpoint', async () => {
    server.use(
      http.get(POLICY, () =>
        HttpResponse.json({
          id: 'ap_1',
          allowed_tools: ['create_payment_order'],
          per_action_limit: '100.00',
          daily_limit: '1000.00',
          require_approval: true,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
        }),
      ),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const policy = await api.getPolicy()

    expect(policy).toEqual({
      id: 'ap_1',
      allowed_tools: ['create_payment_order'],
      per_action_limit: '100.00',
      daily_limit: '1000.00',
      require_approval: true,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })
  })

  it('更新 agent policy 时映射 camelCase 请求字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(POLICY, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          id: 'ap_1',
          allowed_tools: ['create_payment_order'],
          per_action_limit: '100.00',
          daily_limit: '1000.00',
          require_approval: true,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:10:00.000Z',
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const policy = await api.upsertPolicy({
      allowedTools: ['create_payment_order'],
      perActionLimit: '100.00',
      dailyLimit: '1000.00',
      requireApproval: true,
    })

    expect(requestBody).toEqual({
      allowed_tools: ['create_payment_order'],
      per_action_limit: '100.00',
      daily_limit: '1000.00',
      require_approval: true,
    })
    expect(policy.updated_at).toBe('2026-07-01T00:10:00.000Z')
  })

  it('列表 agent actions 时映射 sessionId 分页参数', async () => {
    let requestUrl = ''
    server.use(
      http.get(ACTIONS, ({ request }) => {
        requestUrl = request.url
        return HttpResponse.json({
          items: [
            {
              id: 'aa_1',
              agent_session_id: 'as_1',
              tool: 'create_payment_order',
              input: { amount: '12.00' },
              status: 'pending_approval',
              approver_id: null,
              decided_at: null,
              executed_at: null,
              result: null,
              error_message: null,
              created_at: '2026-07-01T00:00:00.000Z',
            },
          ],
          has_more: false,
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const actions = await api.listActions({ sessionId: 'as_1', limit: 10, offset: 20 })

    const query = new URL(requestUrl).searchParams
    expect(query.get('session_id')).toBe('as_1')
    expect(query.get('limit')).toBe('10')
    expect(query.get('offset')).toBe('20')
    expect(actions.items[0]).toMatchObject({
      id: 'aa_1',
      agent_session_id: 'as_1',
      tool: 'create_payment_order',
    })
    expect(actions.has_more).toBe(false)
  })

  it('请求 agent action 时映射 agentSessionId 请求字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(ACTIONS, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          decision: 'pending_approval',
          actionId: 'aa_1',
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const result = await api.requestAction({
      agentSessionId: 'as_1',
      tool: 'create_payment_order',
      input: { amount: '12.00' },
    })

    expect(requestBody).toEqual({
      agent_session_id: 'as_1',
      tool: 'create_payment_order',
      input: { amount: '12.00' },
    })
    expect(result).toEqual({ decision: 'pending_approval', actionId: 'aa_1' })
  })

  it('批准 agent action 时映射 approverId 请求字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(`${ACTIONS}/aa_1/approve`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          id: 'aa_1',
          agent_session_id: 'as_1',
          tool: 'create_payment_order',
          input: { amount: '12.00' },
          status: 'approved',
          approver_id: 'user_1',
          decided_at: '2026-07-01T00:01:00.000Z',
          executed_at: null,
          result: null,
          error_message: null,
          created_at: '2026-07-01T00:00:00.000Z',
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const action = await api.approveAction('aa_1', { approverId: 'user_1' })

    expect(requestBody).toEqual({ approver_id: 'user_1' })
    expect(action).toMatchObject({ id: 'aa_1', status: 'approved', approver_id: 'user_1' })
  })

  it('拒绝 agent action 时映射 approverId 和 reason 请求字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(`${ACTIONS}/aa_1/reject`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          id: 'aa_1',
          agent_session_id: 'as_1',
          tool: 'create_payment_order',
          input: { amount: '12.00' },
          status: 'rejected',
          approver_id: 'user_1',
          decided_at: '2026-07-01T00:01:00.000Z',
          executed_at: null,
          result: null,
          error_message: 'out of policy',
          created_at: '2026-07-01T00:00:00.000Z',
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const action = await api.rejectAction('aa_1', {
      approverId: 'user_1',
      reason: 'out of policy',
    })

    expect(requestBody).toEqual({ approver_id: 'user_1', reason: 'out of policy' })
    expect(action).toMatchObject({
      id: 'aa_1',
      status: 'rejected',
      error_message: 'out of policy',
    })
  })

  it('标记 action executed 时映射 agentSessionId 和 errorMessage 请求字段', async () => {
    let requestBody: unknown
    server.use(
      http.post(`${ACTIONS}/aa_1/executed`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({
          id: 'aa_1',
          agent_session_id: 'as_1',
          tool: 'create_payment_order',
          input: { amount: '12.00' },
          status: 'executed',
          approver_id: 'user_1',
          decided_at: '2026-07-01T00:01:00.000Z',
          executed_at: '2026-07-01T00:02:00.000Z',
          result: { payment_order_id: 'po_1' },
          error_message: null,
          created_at: '2026-07-01T00:00:00.000Z',
        })
      }),
    )

    const api = new AgentsApi(new HttpClient({ baseUrl: BASE_URL }))
    const action = await api.markExecuted('aa_1', {
      agentSessionId: 'as_1',
      result: { payment_order_id: 'po_1' },
    })

    expect(requestBody).toEqual({
      agent_session_id: 'as_1',
      result: { payment_order_id: 'po_1' },
    })
    expect(action).toMatchObject({
      id: 'aa_1',
      agent_session_id: 'as_1',
      result: { payment_order_id: 'po_1' },
    })
  })

  it('StableOps 暴露 agents resource', () => {
    const client = new StableOps({ baseUrl: BASE_URL })

    expect(client.agents).toBeInstanceOf(AgentsApi)
  })
})
