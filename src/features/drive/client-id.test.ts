import { expect, test } from 'vitest';
import { isDriveConfigured, GOOGLE_CLIENT_ID } from './client-id';

// In the test env NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, so the feature reads as unconfigured.
test('unconfigured when the env var is absent', () => {
  expect(GOOGLE_CLIENT_ID).toBe('');
  expect(isDriveConfigured()).toBe(false);
});
