import { describe, it, expect } from 'vitest';
import { checkBasicAuth } from './basic-auth';

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe('checkBasicAuth', () => {
  it('is unconfigured when no password is set (fail closed)', () => {
    expect(checkBasicAuth(basic('x', 'y'), undefined)).toBe('unconfigured');
    expect(checkBasicAuth(basic('x', 'y'), '')).toBe('unconfigured');
  });

  it('accepts the right password, ignoring the username', () => {
    expect(checkBasicAuth(basic('anyone', 's3cret'), 's3cret')).toBe('ok');
  });

  it('challenges a wrong password', () => {
    expect(checkBasicAuth(basic('x', 'nope'), 's3cret')).toBe('challenge');
  });

  it('challenges a missing or non-Basic header', () => {
    expect(checkBasicAuth(null, 's3cret')).toBe('challenge');
    expect(checkBasicAuth('Bearer abc', 's3cret')).toBe('challenge');
    expect(checkBasicAuth('Basic', 's3cret')).toBe('challenge');
  });

  it('challenges malformed base64 instead of throwing', () => {
    expect(checkBasicAuth('Basic @@@not-base64@@@', 's3cret')).toBe('challenge');
  });

  it('keeps colons inside the password', () => {
    expect(checkBasicAuth(basic('u', 'a:b:c'), 'a:b:c')).toBe('ok');
  });
});
