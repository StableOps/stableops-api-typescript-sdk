# API SDK Production Hardening Design

## Goal

Make `@stableops/api-sdk` safe for production use by preventing automatic retries of
non-idempotent writes, matching the current API contract, and separating Node-only
utilities from the main package entry point.

## Architecture

The main entry point remains a Node 18+ HTTP client with no dependency on `node:http`
or `node:crypto`. Webhook signature helpers move to the `./webhooks` export, while
the in-process mock server moves to `./mock`.

`HttpClient` retries GET requests by default. Write requests are retried only when
the caller explicitly marks the request as retry-safe. Payment order creation sets
that marker because the API requires and enforces an idempotency key. Other write
operations perform one attempt unless their server contract later gains equivalent
idempotency guarantees.

## Public Contract

- Strongly type payment-order status and event chain/asset filters.
- Add `redactMetadata` to webhook endpoint create, update, and response types.
- Add webhook endpoint update.
- Add event detail retrieval and the existing `to_address` and `tx_hash` filters.
- Preserve synchronous Node webhook verification through `@stableops/api-sdk/webhooks`.
- Preserve `MockServer` through `@stableops/api-sdk/mock`.

## Mock Behavior

The mock server implements webhook endpoint create, list, update, and secret rotation.
List and update responses omit the secret. Create and rotation return it once, matching
the real API contract.

## Compatibility

Moving webhook and mock exports to subpaths is a deliberate breaking change before the
first stable release (`0.0.1`). CJS and ESM consumers remain supported for every export.

## Verification

Tests cover retry decisions, request mapping, response mapping, mock secret exposure,
subpath exports, CJS/ESM loading, package contents, lint, typecheck, and build.
