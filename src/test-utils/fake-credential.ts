// Obviously fake; never generate secret-shaped values in tests (PAN-027, appsec R9).
// No imports: Vitest and the e2e fake API both load this file.
export const FAKE_KEY_ID = '0000000000000000'
export const FAKE_CREDENTIAL =
  'mmak_0000000000000000_TEST-ONLY-not-a-real-secret-000000000000000'
