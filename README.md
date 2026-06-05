# StableOps API SDK

Official TypeScript SDK for the StableOps API.

[中文文档](./README.zh-CN.md)

StableOps turns on-chain stablecoin transfers into familiar payment primitives:
payment orders, deterministic status transitions, signed webhooks, retries, and
confirmation tracking. You bring the receiving addresses or custody setup;
StableOps watches supported chains, matches transfers, tracks confirmations,
checks reorgs, and delivers webhook events to your application.

This SDK is intended for server-side TypeScript and JavaScript applications that
create payment orders, query normalized chain events, manage webhook endpoints,
and verify webhook signatures.

## Features

- Type-safe client for payment orders, events, and webhook endpoints.
- Built-in request retry behavior for transient failures.
- Explicit idempotency support for write operations.
- Constant-time webhook signature verification.
- In-process mock server for tests, examples, and local demos.
- Self-contained public types with no StableOps workspace dependencies.
- Dual CJS and ESM builds with generated TypeScript declarations.

## Requirements

- Node.js 18 or newer.
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
  organizationSlug: 'demo',
  environment: 'sandbox',
})

const order = await stableops.paymentOrders.create(
  {
    merchantOrderId: 'order_123',
    amount: '49.00',
    settlementAsset: 'USDC',
    acceptedAssets: [
      { chain: 'base-sepolia', asset: 'USDC' },
      { chain: 'ethereum-sepolia', asset: 'USDC' },
    ],
    metadata: { customerId: 'cus_123', plan: 'pro_monthly' },
  },
  { idempotencyKey: 'order_123:create' },
)

console.log(order.paymentInstructions)
```

Return only the order id, amount, and `paymentInstructions` to your frontend.
The actual API key and order creation flow should stay on your server.

## Documentation

For complete guides, API references, payment lifecycle details, webhook
verification, and wallet integration examples, see the official documentation:

- English docs: https://stableops.dev/en/docs
- Chinese docs: https://stableops.dev/zh/docs

## Supported Chains and Assets

The public SDK types currently include:

- Chains: Ethereum, Base, Arbitrum, Polygon, TRON, Solana, and supported testnets.
- Assets: USDC and USDT.

StableOps may support a subset of chain/asset pairs per environment and
organization configuration. Use the dashboard or API configuration for the
source of truth in production. See the official docs for the latest supported
chains, assets, and environment-specific setup:

- https://stableops.dev/en/docs
- https://stableops.dev/zh/docs

## License

See the repository license.
