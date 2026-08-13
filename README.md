# FRESH

**Know whether to fetch again.**

FRESH is shared URL freshness intelligence for AI agents. Before re-fetching, re-scraping, re-rendering, or re-embedding a URL, ask whether the previously seen version is probably still fresh enough to reuse.

Production base URL: `https://fresh-api-production-c783.up.railway.app`

MCP endpoint: `https://fresh-api-production-c783.up.railway.app/mcp`

FRESH returns one of three decisions:

- `REUSE` — cached knowledge is probably still fresh enough
- `REFETCH` — the URL is likely stale enough to justify another retrieval
- `UNKNOWN` — evidence is insufficient; FRESH prefers uncertainty over false confidence

## Why FRESH exists

A local cache knows when *you* last fetched something. It does not know whether the outside resource changed since then, nor what other callers recently observed. FRESH builds shared, privacy-safe URL change history from timestamps, ETags, Last-Modified values, and content hashes.

## REST

### `POST /v1/check`

```json
{"url":"https://example.com/docs/api","lastSeenAt":"2026-08-13T12:00:00Z","toleranceSeconds":3600}
```

### `POST /v1/observe`

```json
{"url":"https://example.com/docs/api","observedAt":"2026-08-13T13:00:00Z","etag":"abc123","lastModified":"Wed, 13 Aug 2026 12:45:00 GMT","contentHash":"sha256:..."}
```

Raw page content is not required.

## MCP

- `fresh_check` — decide whether to retrieve a URL again
- `fresh_observe` — report privacy-safe freshness evidence after retrieval

## Privacy

FRESH does not need raw page contents, cookies, target-site credentials, or customer payloads. URL keys are stored as one-way hashes with aggregate observation metadata.

## Stranger verification

A core-tool invocation is evidence of use, not automatically proof of a genuine stranger. FRESH classifies candidate activity as `KNOWN_VALIDATOR`, `LIKELY_VALIDATOR`, `CONTROLLED_TEST`, `UNKNOWN_MACHINE`, or `CREDIBLE_REAL_USE`. Only `CREDIBLE_REAL_USE` advances stranger milestones.

Our acceptance/smoke traffic uses `X-Tollbooth-Internal: 1` or `X-Fresh-Internal: 1` so it cannot earn stranger credit.

## Status

V1.0.1 experimental production infrastructure. Priorities: conservative decisions, low latency, sub-penny economics, privacy-safe shared learning, REST + MCP, durable observations, and auditable real-use analytics.
