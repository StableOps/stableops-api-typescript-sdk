import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { AgentsApi } from './agents'
import { HttpClient } from './http'
import { StableOps } from './index'

const BASE_URL = 'https://api.test.local'
const SESSIONS = `${BASE_URL}/v1/agent/sessions`
const ACTIONS = `${BASE_URL}/v1/agent/actions`

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

    expect(requestBody).toEqual({ label: 'ops-bot', expires_at: undefined })
    expect(session).toEqual({
      id: 'as_1',
      label: 'ops-bot',
      created_at: '2026-07-01T00:00:00.000Z',
      expires_at: null,
      revoked_at: null,
    })
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
      error_message: undefined,
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
