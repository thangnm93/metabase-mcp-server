import { describe, it, expect } from 'vitest';
import { filterPii, filterPiiFromToolResult } from './pii-filter.js';

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
      filterPii([{ email: 'john@example.com', score: 99 }, { email: 'jane@example.com', score: 87 }])
    ).toEqual([{ email: '[REDACTED]', score: 99 }, { email: '[REDACTED]', score: 87 }]);
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
