# PII Filter — Design Spec

**Date:** 2026-05-14  
**Branch:** support-extra-headers  
**Status:** Approved

## Summary

Add a PII (Personally Identifiable Information) filtering layer to the Metabase MCP server. The filter intercepts every tool's response before it is returned to the AI client and redacts any sensitive field values.

---

## Scope

- Applies to **all tool responses** (every `server.addTool` execute function).
- Configurable via `METABASE_PII_FILTER` env var (default `true`).
- Behavior on detection: **mask** — replace value with `"[REDACTED]"`. The key is preserved so the AI knows the field exists.

---

## File Structure

```
src/
├── server.ts                   ← modified: wrap execute in monkey-patched addTool
├── utils/
│   ├── pii-filter.ts           ← new: all filter logic
│   ├── pii-filter.test.ts      ← new: unit + integration tests
│   ├── tool-filters.ts         ← unchanged
│   └── config.ts               ← modified: add isPiiFilterEnabled()
```

---

## Configuration

| Env var | Values | Default |
|---------|--------|---------|
| `METABASE_PII_FILTER` | `true` / `false` | `true` |

`isPiiFilterEnabled()` reads `process.env.METABASE_PII_FILTER`. Returns `true` unless explicitly set to `"false"`.

---

## PII Detection — Two Layers

### Layer 1: Field Name Match (case-insensitive)

The following key names are treated as PII regardless of value:

```
email, phone, mobile, password, passwd, secret, token, ssn,
credit_card, card_number, cvv, dob, date_of_birth, address,
first_name, last_name, full_name, national_id, passport,
ip_address, latitude, longitude
```

Match is exact on the lowercased key name.

### Layer 2: Regex on Value (runs only if Layer 1 did not match)

Only applied to `string` primitives (numbers and booleans are never regex-checked to avoid false positives on IDs).

| Pattern | Detects |
|---------|---------|
| `[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}` | Email address |
| `\+?\d[\d\s\-().]{7,}\d` | Phone number (VN/international) |
| `\d{3}-\d{2}-\d{4}` | US SSN |
| `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b` | Credit card number |
| `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` | IPv4 address |

---

## Core API (`src/utils/pii-filter.ts`)

```typescript
// Recursively traverse any value; redact PII fields/values
export function filterPii(value: unknown): unknown

// Parse tool result string → filterPii → re-stringify
// Falls back to regex-on-string if JSON.parse fails
export function filterPiiFromToolResult(result: string): string
```

`filterPii` traversal rules:
- **Object**: for each key, if key matches Layer 1 → replace value with `"[REDACTED]"`. Otherwise recurse into value; if result is a string, apply Layer 2.
- **Array**: recurse into each element.
- **String**: apply Layer 2 (used for non-keyed strings in arrays).
- **Number / Boolean / null**: return as-is.

---

## Integration with `server.ts`

Within the existing `addTool` monkey-patch (after tool-filter routing), wrap `execute`:

```typescript
const originalExecute = toolDef.execute;
toolDef.execute = async (...args: any[]) => {
  const result = await originalExecute(...args);
  if (!isPiiFilterEnabled()) return result;
  return filterPiiFromToolResult(result);
};
```

**Error resilience:** if `filterPiiFromToolResult` throws for any reason, log a warning and return the original result. The tool must not break due to filter errors.

---

## Test Plan (`src/utils/pii-filter.test.ts`)

### `filterPii()` unit tests

| Input | Expected output |
|-------|----------------|
| `{ email: "user@example.com" }` | `{ email: "[REDACTED]" }` |
| `{ data: "contact: user@example.com" }` | `{ data: "[REDACTED]" }` |
| `{ user: { email: "x@y.com", age: 25 } }` | `{ user: { email: "[REDACTED]", age: 25 } }` |
| `[{ name: "John", score: 99 }]` | `[{ name: "[REDACTED]", score: 99 }]` |
| `{ id: 1, title: "Revenue Q1" }` | `{ id: 1, title: "Revenue Q1" }` |
| `{ user_id: 1234567890 }` | `{ user_id: 1234567890 }` (no regex on numbers) |

### `filterPiiFromToolResult()` integration tests

- JSON string round-trip: parse → filter → stringify preserves structure
- Non-JSON string: regex applied directly on raw string
- Filter throws internally → original result returned, warning logged

### Config tests

- `METABASE_PII_FILTER=false` → `filterPiiFromToolResult` is bypassed entirely
- `METABASE_PII_FILTER` unset → filter is active (default `true`)
