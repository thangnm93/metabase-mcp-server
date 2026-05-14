# PII Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PII filtering layer that redacts sensitive field values in every MCP tool response, controlled by `METABASE_PII_FILTER` env var (default `true`).

**Architecture:** Monkey-patch the existing `server.addTool` in `server.ts` to wrap each tool's `execute` function. After execution, the string result passes through `filterPiiFromToolResult()` which parses JSON, recursively redacts PII fields/values, and re-stringifies. PII detection uses two layers: field-name heuristics first, regex on string values second.

**Tech Stack:** TypeScript, Vitest (test runner), Node.js `process.env`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/config.ts` | Modify | Add `isPiiFilterEnabled()` |
| `src/utils/pii-filter.ts` | Create | `filterPii()` + `filterPiiFromToolResult()` |
| `src/utils/pii-filter.test.ts` | Create | Unit + integration tests |
| `src/server.ts` | Modify | Wrap `execute` in `addTool` monkey-patch |

---

## Task 1: Add `isPiiFilterEnabled()` to config.ts

**Files:**
- Modify: `src/utils/config.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/utils/config.test.ts` inside a new `describe('isPiiFilterEnabled', ...)` block at the bottom of the file:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, validateConfig, isPiiFilterEnabled } from './config.js';
```

Then add at the end of the file (after the `validateConfig` describe block):

```typescript
describe('isPiiFilterEnabled', () => {
  const original = process.env.METABASE_PII_FILTER;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.METABASE_PII_FILTER;
    } else {
      process.env.METABASE_PII_FILTER = original;
    }
  });

  it('returns true when env var is not set', () => {
    delete process.env.METABASE_PII_FILTER;
    expect(isPiiFilterEnabled()).toBe(true);
  });

  it('returns true when env var is "true"', () => {
    process.env.METABASE_PII_FILTER = 'true';
    expect(isPiiFilterEnabled()).toBe(true);
  });

  it('returns false when env var is "false"', () => {
    process.env.METABASE_PII_FILTER = 'false';
    expect(isPiiFilterEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose src/utils/config.test.ts
```

Expected: FAIL — `isPiiFilterEnabled is not a function` (or similar import error)

- [ ] **Step 3: Implement `isPiiFilterEnabled` in config.ts**

Add at the end of `src/utils/config.ts`:

```typescript
export function isPiiFilterEnabled(): boolean {
  return process.env.METABASE_PII_FILTER !== 'false';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose src/utils/config.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts src/utils/config.test.ts
git commit -m "feat: add isPiiFilterEnabled() to config"
```

---

## Task 2: Create `pii-filter.ts` with `filterPii()`

**Files:**
- Create: `src/utils/pii-filter.ts`
- Create: `src/utils/pii-filter.test.ts`

- [ ] **Step 1: Write the failing tests for `filterPii()`**

Create `src/utils/pii-filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { filterPii } from './pii-filter.js';

describe('filterPii — field name detection (Layer 1)', () => {
  it('redacts value when key is "email"', () => {
    expect(filterPii({ email: 'user@example.com' })).toEqual({ email: '[REDACTED]' });
  });

  it('redacts value when key is "phone"', () => {
    expect(filterPii({ phone: '+84901234567' })).toEqual({ phone: '[REDACTED]' });
  });

  it('redacts value when key is "password"', () => {
    expect(filterPii({ password: 'secret123' })).toEqual({ password: '[REDACTED]' });
  });

  it('redacts value when key is "first_name"', () => {
    expect(filterPii({ first_name: 'John' })).toEqual({ first_name: '[REDACTED]' });
  });

  it('redacts value when key is "last_name"', () => {
    expect(filterPii({ last_name: 'Doe' })).toEqual({ last_name: '[REDACTED]' });
  });

  it('redacts value when key is "full_name"', () => {
    expect(filterPii({ full_name: 'John Doe' })).toEqual({ full_name: '[REDACTED]' });
  });

  it('redacts value when key is "address"', () => {
    expect(filterPii({ address: '123 Main St' })).toEqual({ address: '[REDACTED]' });
  });

  it('redacts value when key is "ssn"', () => {
    expect(filterPii({ ssn: '123-45-6789' })).toEqual({ ssn: '[REDACTED]' });
  });

  it('redacts value when key is "token"', () => {
    expect(filterPii({ token: 'abc123xyz' })).toEqual({ token: '[REDACTED]' });
  });

  it('redacts value when key is "credit_card"', () => {
    expect(filterPii({ credit_card: '4111111111111111' })).toEqual({ credit_card: '[REDACTED]' });
  });

  it('matches key names case-insensitively', () => {
    expect(filterPii({ Email: 'x@y.com' })).toEqual({ Email: '[REDACTED]' });
    expect(filterPii({ EMAIL: 'x@y.com' })).toEqual({ EMAIL: '[REDACTED]' });
  });

  it('does not redact safe fields', () => {
    expect(filterPii({ id: 1, title: 'Revenue Q1', count: 42 })).toEqual({
      id: 1,
      title: 'Revenue Q1',
      count: 42,
    });
  });
});

describe('filterPii — value regex detection (Layer 2)', () => {
  it('redacts string containing an email address', () => {
    expect(filterPii({ contact: 'reach me at user@example.com' })).toEqual({
      contact: '[REDACTED]',
    });
  });

  it('redacts string that is a bare email address', () => {
    expect(filterPii({ value: 'user@example.com' })).toEqual({ value: '[REDACTED]' });
  });

  it('redacts string matching a credit card pattern', () => {
    expect(filterPii({ info: '4111 1111 1111 1111' })).toEqual({ info: '[REDACTED]' });
  });

  it('redacts string matching US SSN pattern', () => {
    expect(filterPii({ ref: '123-45-6789' })).toEqual({ ref: '[REDACTED]' });
  });

  it('redacts string matching IPv4 address', () => {
    expect(filterPii({ origin: '192.168.1.1' })).toEqual({ origin: '[REDACTED]' });
  });

  it('does not apply regex to numbers', () => {
    expect(filterPii({ user_id: 1234567890 })).toEqual({ user_id: 1234567890 });
  });

  it('does not apply regex to booleans', () => {
    expect(filterPii({ active: true })).toEqual({ active: true });
  });

  it('does not apply regex to null', () => {
    expect(filterPii({ data: null })).toEqual({ data: null });
  });
});

describe('filterPii — nested structures', () => {
  it('recurses into nested objects', () => {
    expect(
      filterPii({ user: { email: 'x@y.com', age: 25 } })
    ).toEqual({ user: { email: '[REDACTED]', age: 25 } });
  });

  it('recurses into arrays of objects', () => {
    expect(
      filterPii([{ name: 'John', score: 99 }, { name: 'Jane', score: 87 }])
    ).toEqual([{ name: '[REDACTED]', score: 99 }, { name: '[REDACTED]', score: 87 }]);
  });

  it('recurses into mixed nested structure', () => {
    const input = {
      results: [
        { id: 1, email: 'a@b.com', revenue: 1000 },
        { id: 2, email: 'c@d.com', revenue: 2000 },
      ],
      meta: { total: 2 },
    };
    expect(filterPii(input)).toEqual({
      results: [
        { id: 1, email: '[REDACTED]', revenue: 1000 },
        { id: 2, email: '[REDACTED]', revenue: 2000 },
      ],
      meta: { total: 2 },
    });
  });

  it('handles arrays of primitives with PII strings', () => {
    expect(filterPii(['hello', 'user@example.com', 'world'])).toEqual([
      'hello',
      '[REDACTED]',
      'world',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose src/utils/pii-filter.test.ts
```

Expected: FAIL — `Cannot find module './pii-filter.js'`

- [ ] **Step 3: Implement `filterPii` in `pii-filter.ts`**

Create `src/utils/pii-filter.ts`:

```typescript
const PII_FIELD_NAMES = new Set([
  'email', 'phone', 'mobile', 'password', 'passwd', 'secret', 'token',
  'ssn', 'credit_card', 'card_number', 'cvv', 'dob', 'date_of_birth',
  'address', 'first_name', 'last_name', 'full_name', 'national_id',
  'passport', 'ip_address', 'latitude', 'longitude',
]);

const PII_REGEXES = [
  /[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/,               // email
  /\+?\d[\d\s\-(). ]{7,}\d/,                         // phone
  /\b\d{3}-\d{2}-\d{4}\b/,                           // US SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,    // credit card
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,         // IPv4
];

function isPiiFieldName(key: string): boolean {
  return PII_FIELD_NAMES.has(key.toLowerCase());
}

function matchesPiiRegex(value: string): boolean {
  return PII_REGEXES.some(re => re.test(value));
}

export function filterPii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => filterPii(item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isPiiFieldName(key)) {
        result[key] = '[REDACTED]';
      } else {
        const filtered = filterPii(val);
        result[key] = filtered;
      }
    }
    return result;
  }

  if (typeof value === 'string' && matchesPiiRegex(value)) {
    return '[REDACTED]';
  }

  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose src/utils/pii-filter.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/pii-filter.ts src/utils/pii-filter.test.ts
git commit -m "feat: add filterPii() with field-name and regex PII detection"
```

---

## Task 3: Add `filterPiiFromToolResult()` to `pii-filter.ts`

**Files:**
- Modify: `src/utils/pii-filter.ts`
- Modify: `src/utils/pii-filter.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `src/utils/pii-filter.test.ts` (replace the existing `import { filterPii }` line):

```typescript
import { filterPii, filterPiiFromToolResult } from './pii-filter.js';
```

Then append the following describe block to the end of the file:

```typescript
describe('filterPiiFromToolResult', () => {
  it('parses JSON string, filters, and re-stringifies', () => {
    const input = JSON.stringify({ email: 'user@example.com', id: 1 });
    const output = filterPiiFromToolResult(input);
    expect(JSON.parse(output)).toEqual({ email: '[REDACTED]', id: 1 });
  });

  it('handles JSON array result', () => {
    const input = JSON.stringify([{ email: 'a@b.com' }, { email: 'c@d.com' }]);
    const output = filterPiiFromToolResult(input);
    expect(JSON.parse(output)).toEqual([{ email: '[REDACTED]' }, { email: '[REDACTED]' }]);
  });

  it('applies regex directly on non-JSON string fallback', () => {
    const input = 'User email: user@example.com';
    expect(filterPiiFromToolResult(input)).toBe('[REDACTED]');
  });

  it('returns plain non-PII string unchanged', () => {
    const input = 'No sensitive data here';
    expect(filterPiiFromToolResult(input)).toBe('No sensitive data here');
  });

  it('does not throw on any valid string input', () => {
    expect(() => filterPiiFromToolResult(JSON.stringify({ id: 1, title: 'safe' }))).not.toThrow();
    expect(() => filterPiiFromToolResult('plain string')).not.toThrow();
    expect(() => filterPiiFromToolResult('')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose src/utils/pii-filter.test.ts
```

Expected: FAIL — `filterPiiFromToolResult is not a function`

- [ ] **Step 3: Implement `filterPiiFromToolResult` in `pii-filter.ts`**

Append to the end of `src/utils/pii-filter.ts`:

```typescript
export function filterPiiFromToolResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    const filtered = filterPii(parsed);
    return JSON.stringify(filtered, null, 2);
  } catch {
    // Not valid JSON — apply regex on the raw string directly
    if (typeof result === 'string' && matchesPiiRegex(result)) {
      return '[REDACTED]';
    }
    return result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose src/utils/pii-filter.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/pii-filter.ts src/utils/pii-filter.test.ts
git commit -m "feat: add filterPiiFromToolResult() with JSON and fallback handling"
```

---

## Task 4: Integrate PII filter into `server.ts`

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add imports to `server.ts`**

At the top of `src/server.ts`, add to the existing import block:

```typescript
import { isPiiFilterEnabled } from "./utils/config.js";
import { filterPiiFromToolResult } from "./utils/pii-filter.js";
```

- [ ] **Step 2: Wrap `execute` inside the existing `addTool` monkey-patch**

Replace the current `server.addTool` override in `src/server.ts`. The existing block is:

```typescript
// Override addTool to apply filtering
const originalAddTool = server.addTool.bind(server);
server.addTool = function(toolConfig: any) {
  const { metadata = {}, ...restConfig } = toolConfig;
  const { isWrite, isEssential, isRead } = metadata;

  // Apply filtering based on selected mode
  switch (filterOptions.mode) {
    case 'essential':
      // Only load essential tools
      if (!isEssential) return;
      break;
    case 'write':
      // Load read and write tools
      if (!isRead && !isWrite) return;
      break;
    case 'all':
      // Load all tools - no filtering
      break;
  }

  // Register the tool
  originalAddTool(restConfig);
};
```

Replace it with:

```typescript
// Override addTool to apply filtering and PII redaction
const originalAddTool = server.addTool.bind(server);
server.addTool = function(toolConfig: any) {
  const { metadata = {}, ...restConfig } = toolConfig;
  const { isWrite, isEssential, isRead } = metadata;

  // Apply filtering based on selected mode
  switch (filterOptions.mode) {
    case 'essential':
      if (!isEssential) return;
      break;
    case 'write':
      if (!isRead && !isWrite) return;
      break;
    case 'all':
      break;
  }

  // Wrap execute with PII filter
  if (restConfig.execute) {
    const originalExecute = restConfig.execute;
    restConfig.execute = async (...args: any[]) => {
      const result = await originalExecute(...args);
      if (!isPiiFilterEnabled()) return result;
      try {
        return filterPiiFromToolResult(result);
      } catch (e) {
        console.error('[pii-filter] Warning: filter failed, returning original result', e);
        return result;
      }
    };
  }

  // Register the tool
  originalAddTool(restConfig);
};
```

- [ ] **Step 3: Add startup log for PII filter status**

After the existing tool filtering log lines in `src/server.ts` (around line 62), add:

```typescript
console.error(`INFO: PII filter: ${isPiiFilterEnabled() ? 'enabled' : 'disabled (METABASE_PII_FILTER=false)'}`);
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: exits 0, no TypeScript errors

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests PASS (including the new pii-filter tests and the existing config/tool-filter tests)

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: integrate PII filter into server.ts addTool wrapper"
```

---

## Task 5: Verify end-to-end behaviour manually

**Files:** none (smoke test only)

- [ ] **Step 1: Start dev server with PII filter enabled (default)**

```bash
METABASE_URL=http://localhost:3000 METABASE_API_KEY=test npm run dev
```

Expected: server starts, logs include:
```
INFO: PII filter: enabled
```

- [ ] **Step 2: Start dev server with PII filter disabled**

```bash
METABASE_PII_FILTER=false METABASE_URL=http://localhost:3000 METABASE_API_KEY=test npm run dev
```

Expected: logs include:
```
INFO: PII filter: disabled (METABASE_PII_FILTER=false)
```

- [ ] **Step 3: Final commit if any docs were updated**

```bash
git add .
git commit -m "chore: verify PII filter end-to-end"
```
