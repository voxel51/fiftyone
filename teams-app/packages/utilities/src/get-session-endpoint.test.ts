import { describe, it, expect } from 'vitest';
import getSessionEndpoint from './get-session-endpoint';

describe('getSessionEndpoint', () => {
  it('returns session endpoint with default redirect endpoint when redirect is not provided', () => {
    expect(getSessionEndpoint()).toBe('/cas/api/auth/session?redirect=%2F');
    expect(getSessionEndpoint('')).toBe('/cas/api/auth/session?redirect=%2F');
  });

  it('returns session endpoint with encoded redirect param', () => {
    expect(getSessionEndpoint('/datasets?page=1&pageSize=50')).toBe(
      '/cas/api/auth/session?redirect=%2Fdatasets%3Fpage%3D1%26pageSize%3D50'
    );
  });
});
