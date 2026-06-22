# API SDK Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public SDK safe for production writes, aligned with the API contract, and cleanly packaged by runtime responsibility.

**Architecture:** Keep the default entry free of Node-only webhook/mock imports. Add an explicit retry-safety flag to internal requests, and expose existing server capabilities through strongly typed SDK methods.

**Tech Stack:** TypeScript, fetch, Vitest, MSW, tsup, Node.js 18+

---

### Task 1: Safe Retry Semantics

**Files:**

- Modify: `src/http.ts`
- Modify: `src/payment-orders.ts`
- Test: `src/http.spec.ts`

- [ ] Add failing tests proving POST does not retry by default and retry-safe POST reuses one idempotency key.
- [ ] Add `retryable?: boolean` to the internal request shape and restrict retries to GET or explicitly retryable requests.
- [ ] Mark payment-order creation retryable and run `pnpm test src/http.spec.ts`.

### Task 2: API Contract Alignment

**Files:**

- Modify: `src/types.ts`
- Modify: `src/payment-orders.ts`
- Modify: `src/webhooks.ts`
- Test: `src/payment-orders.spec.ts`
- Create: `src/webhooks.spec.ts`

- [ ] Add failing tests for typed event filters/detail mapping and webhook `redact_metadata` create/update/response mapping.
- [ ] Add event detail public types and methods, strong list parameter types, webhook event types, and endpoint update support.
- [ ] Run the focused payment-order and webhook tests.

### Task 3: Runtime-Specific Package Exports

**Files:**

- Modify: `src/index.ts`
- Create: `src/webhooks-entry.ts`
- Create: `src/mock-entry.ts`
- Modify: `tsup.config.ts`
- Modify: `package.json`
- Modify: `src/publish-contract.spec.ts`

- [ ] Add failing publish-contract tests requiring `./webhooks` and `./mock` exports and a Node-built-in-free main bundle.
- [ ] Build three entry points and map CJS, ESM, and declaration files in package exports.
- [ ] Verify CJS and ESM imports for all three entry points.

### Task 4: Mock Contract Fidelity

**Files:**

- Modify: `src/mock-server.ts`
- Create: `src/mock-server.spec.ts`

- [ ] Add failing tests proving list/update omit secrets and rotation returns a new secret.
- [ ] Implement update and rotation routes with one-time secret exposure.
- [ ] Run the focused mock tests.

### Task 5: Documentation and Full Verification

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] Update imports and runtime requirements for the new subpaths.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Run `npm pack --dry-run --json` with a writable temporary npm cache.
