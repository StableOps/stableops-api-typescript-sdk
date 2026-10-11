# StableOps API SDK

[![npm version](https://img.shields.io/npm/v/@stableops/api-sdk)](https://www.npmjs.com/package/@stableops/api-sdk) [![npm downloads](https://img.shields.io/npm/dm/@stableops/api-sdk)](https://www.npmjs.com/package/@stableops/api-sdk) [![License](https://img.shields.io/npm/l/@stableops/api-sdk)](./LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org) [![Node](https://img.shields.io/badge/Node-%3E%3D20-339933)](https://nodejs.org)

[中文文档](./README.zh-CN.md)

StableOps turns on-chain stablecoin transfers into familiar payment primitives:
payment orders, deterministic status transitions, signed webhooks, retries, and
confirmation tracking. You bring the receiving addresses or custody setup;
StableOps watches supported chains, matches transfers, tracks confirmations,
checks reorgs, and delivers webhook events to your application.

This SDK is intended for server-side TypeScript and JavaScript applications that
create payment orders and checkout sessions, manage receiving addresses, refunds,
payment links, merchant subscriptions and agent audit resources, and verify webhook signatures.

## Features

- Type-safe client for payment orders, checkout sessions, addresses, refunds, payment links, merchant subscriptions, agent audit resources, and webhooks.
- Retries for reads and explicitly idempotent payment-order and checkout-session creation. Other writes are not retried automatically.
- Explicit idempotency support for write operations.
- Constant-time webhook signature verification.
- In-process mock server for tests, examples, and local demos.
- Self-contained public types with no StableOps workspace dependencies.
- Dual CJS and ESM builds with generated TypeScript declarations.

## Requirements

- Node.js 20 or newer.
- A StableOps API key.
- A server-side environment. Do not expose your API key in browser code.

## Installation

```bash
pnpm add @stableops/api-sdk
```

```bash
npm install @stableops/api-sdk
```

```bash
yarn add @stableops/api-sdk
```

## Quick Start

```ts
import { StableOps } from '@stableops/api-sdk'

const stableops = new StableOps({
  apiKey: process.env.STABLEOPS_API_KEY!,
})

const order = await stableops.paymentOrders.create(
  {
    merchantOrderId: 'order_123',
    amount: '49.00',
    acceptedAssets: [
      { chain: 'base-sepolia', asset: 'USDC' },
      { chain: 'ethereum-sepolia', asset: 'USDC' },
    ],
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    metadata: { customerId: 'cus_123', plan: 'pro_monthly' },
  },
  { idempotencyKey: 'order_123:create' },
)

console.log(order.paymentInstructions)
```

Webhook verification and the mock server use explicit Node-only subpath exports:

```ts
import { SIGNATURE_HEADER, verifySignature } from '@stableops/api-sdk/webhooks'
import { MockServer } from '@stableops/api-sdk/mock'
```

The default `@stableops/api-sdk` entry does not import Node `crypto` or `http`
modules, so edge-compatible server runtimes can use the API client when they
provide `fetch`, `AbortController`, and Web Crypto `getRandomValues`.

Return only the order id, amount, and `paymentInstructions` to your frontend.
The actual API key and order creation flow should stay on your server.

## Resources

| Resource                | Operations                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| `paymentOrders`         | Create, retrieve, list, and cancel orders                                    |
| `checkoutSessions`      | Create hosted checkout sessions                                              |
| `addresses`             | Import and manage receiving addresses                                        |
| `refunds`               | Create, retrieve, list, submit a transaction, and cancel refunds             |
| `paymentLinks`          | Create, list, update, and inspect associated orders                          |
| `merchantSubscriptions` | Manage plans, subscriptions, invoices, billing settings, and portal sessions |
| `agents`                | Manage agent sessions, policies, approval requests, and audit results        |
| `webhooks`              | Manage endpoints, inspect deliveries, and replay events                      |
| `portal(token)`         | Access end-user subscription and invoice operations using a portal token     |

Refund requests do not move funds. The merchant signs and broadcasts the refund
transfer, then registers its transaction hash for tracking:

```ts
const refund = await stableops.refunds.create({
  paymentOrderId: 'po_123',
  amount: '5.00',
  destinationAddress: '0x0000000000000000000000000000000000000001',
})
await stableops.refunds.submit(refund.id, { txHash: merchantSignedTransactionHash })

const link = await stableops.paymentLinks.create({
  title: 'Pro plan',
  amount: '49.00',
  acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
  payerFields: ['email', 'reference'],
})
const page = await stableops.paymentLinks.orders(link.id, { limit: 20 })
```

`listPage()` returns `items`, `hasMore`, and `total`. `paymentLinks.orders()` also
returns the link configuration, payer details, payment transactions, and completed-order count.
Webhook subscriptions accept payment, refund, merchant subscription, invoice,
agent audit, and Agent Payments events.

## Documentation

For complete guides, API references, payment lifecycle details, webhook
verification, and wallet integration examples, see the official documentation:

- English docs: https://stableops.dev/en/docs
- Chinese docs: https://stableops.dev/zh/docs

## Supported Chains and Assets

This SDK supports:

- Chains: Ethereum, Base, Arbitrum, Polygon, Optimism, BSC, TRON, Solana, and supported testnets.
- Assets: USDC and USDT.

StableOps may support a subset of chain/asset pairs per environment and
organization configuration. Use the dashboard or API configuration for the
source of truth in production.

## License

This SDK is licensed under `Apache-2.0`. See [LICENSE](./LICENSE).
