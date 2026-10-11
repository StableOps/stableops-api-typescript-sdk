# StableOps API SDK

[查看英文说明](./README.md)

StableOps 将链上稳定币转账转化为支付订单、收银台会话、签名 Webhook 和明确的付款状态。你提供收款地址，StableOps 跟踪转账及确认结果，并向你的应用投递事件。

本 SDK 适用于服务端 TypeScript 和 JavaScript 应用，支持订单、收款地址、退款、支付链接、商户订阅及代理审计操作。

## 安装与要求

需要 Node.js 20 或更高版本，或提供 `fetch`、`AbortController` 和 Web Crypto `getRandomValues` 的服务端边缘运行时。默认入口兼容这些边缘运行时，验签与模拟服务使用独立的 Node.js 入口。

```bash
pnpm add @stableops/api-sdk
```

API 密钥应保留在服务端。前端只接收订单编号、金额和付款指令。

## 快速开始

```ts
import { StableOps } from '@stableops/api-sdk'

const stableops = new StableOps({ apiKey: process.env.STABLEOPS_API_KEY! })
const order = await stableops.paymentOrders.create(
  {
    merchantOrderId: 'order_123',
    amount: '49.00',
    acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
    expiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
  },
  { idempotencyKey: 'order_123:create' },
)
console.log(order.paymentInstructions)
```

沙盒订单最多保留 30 分钟，正式环境订单最多保留 24 小时。查询请求可在临时失败后自动重试。订单和收银台会话创建请求通过幂等键安全重试，你可以显式提供幂等键，也可以使用 SDK 根据商户订单编号生成的默认值。其他写操作不会自动重试。

## 资源与操作

| 资源                    | 支持的操作                                       |
| ----------------------- | ------------------------------------------------ |
| `paymentOrders`         | 创建、查询、列出和取消订单                       |
| `checkoutSessions`      | 创建托管收银台会话                               |
| `addresses`             | 导入和管理收款地址                               |
| `refunds`               | 创建、查询和列出退款，登记交易，取消未提交的退款 |
| `paymentLinks`          | 创建、列出和更新支付链接，查询关联订单           |
| `merchantSubscriptions` | 管理套餐、订阅、账单、计费设置和用户门户会话     |
| `agents`                | 管理代理会话、策略、审批请求和审计结果           |
| `webhooks`              | 管理端点、查询投递记录和重放事件                 |
| `portal(token)`         | 使用用户门户令牌操作该用户的订阅与账单           |

退款请求不会直接转账。商户使用自己的钱包签名并广播退款交易，再登记交易哈希以跟踪结果：

```ts
const refund = await stableops.refunds.create({
  paymentOrderId: 'po_123',
  amount: '5.00',
  destinationAddress: '0x0000000000000000000000000000000000000001',
})
await stableops.refunds.submit(refund.id, { txHash: merchantSignedTransactionHash })

const link = await stableops.paymentLinks.create({
  title: '专业版套餐',
  amount: '49.00',
  acceptedAssets: [{ chain: 'base-sepolia', asset: 'USDC' }],
  payerFields: ['email', 'reference'],
})
const page = await stableops.paymentLinks.orders(link.id, { limit: 20 })
```

`listPage()` 返回 `items`、`hasMore` 和 `total`。`paymentLinks.orders()` 还返回链接配置、付款人信息、付款交易和完成订单数量。

Webhook 可订阅付款、退款、商户订阅、账单、代理审计及 Agent Payments 事件。

## Webhook 验签与模拟服务

```ts
import { SIGNATURE_HEADER, verifySignature } from '@stableops/api-sdk/webhooks'
import { MockServer } from '@stableops/api-sdk/mock'
```

这两个子路径入口需要 Node.js。默认 API 客户端入口不引入 Node.js 的加密或 HTTP 模块。

## 支持的链与资产

支持 Ethereum、Base、Arbitrum、Polygon、Optimism、BSC、TRON、Solana 及其受支持的测试网。资产包括 USDC 和 USDT，实际可用组合以组织和环境的支持范围为准。

## 官方文档

- [中文接入指南](https://stableops.dev/zh/docs/sdk/api-sdk)
- [英文接入指南](https://stableops.dev/en/docs/sdk/api-sdk)

## 许可证

本 SDK 使用 `Apache-2.0` 许可证，见 [LICENSE](./LICENSE)。
