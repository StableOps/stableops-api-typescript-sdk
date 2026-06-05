# StableOps API SDK

StableOps 官方 TypeScript SDK。

[View English README](./README.md)

StableOps 将链上稳定币转账抽象成开发者熟悉的支付基础设施：Payment Order、确定性的状态机、签名 Webhook、失败重试和确认数跟踪。你负责业务订单、收款地址或托管设置；StableOps 负责链上扫描、转账匹配、确认数推进、重组检查和 Webhook 投递。

这个 SDK 适合服务端 TypeScript / JavaScript 应用，用于创建支付订单、查询标准化链上事件、管理 Webhook Endpoint，并验证 Webhook 签名。

## 功能

- 类型友好的 Payment Orders、Events、Webhook Endpoints API。
- 对临时错误内置重试策略。
- 写请求显式支持幂等键。
- 内置常量时间 Webhook 签名验证。
- 提供进程内 Mock Server，便于测试、示例和本地演示。
- Public types 已内联，不依赖 StableOps 内部 workspace 包。
- 同时输出 CJS、ESM 和 TypeScript 类型声明。

## 环境要求

- Node.js 18 或更高版本。
- StableOps API Key。
- 服务端运行环境。不要把 API Key 暴露到浏览器代码里。

## 安装

```bash
pnpm add @stableops/api-sdk
```

```bash
npm install @stableops/api-sdk
```

```bash
yarn add @stableops/api-sdk
```

## 快速开始

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

前端只需要拿到订单 id、金额和 `paymentInstructions`。API Key 和创建订单的逻辑应始终放在服务端。

## 官方文档

完整接入指南、API Reference、支付订单生命周期、Webhook 验签和钱包集成示例，请查看官方文档：

- 中文文档：https://stableops.dev/zh/docs
- English docs：https://stableops.dev/en/docs

## 支持的链和资产

当前 public SDK types 包含：

- 链：Ethereum、Base、Arbitrum、Polygon、TRON、Solana 以及支持的测试网。
- 资产：USDC 和 USDT。

实际可用的 chain/asset 组合可能受环境和组织配置影响。生产环境请以 Dashboard 或 API 配置为准。
最新支持范围和环境配置请参考官方文档：

- https://stableops.dev/zh/docs
- https://stableops.dev/en/docs

## License

本 SDK 使用 `Apache-2.0` 许可证。详见 [LICENSE](./LICENSE)。
