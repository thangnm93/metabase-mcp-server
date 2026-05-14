const PII_FIELD_NAMES = new Set([
  'email', 'phone', 'mobile', 'password', 'passwd', 'secret', 'token',
  'ssn', 'credit_card', 'card_number', 'cvv', 'dob', 'date_of_birth',
  'address', 'name', 'first_name', 'last_name', 'full_name', 'national_id',
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
