import { describe, expect, it, vi } from 'vitest';
import { getUrls } from './auth-urls';

describe('teams-utilities: auth-urls', () => {
  it('should return http urls', () => {
    const req = { headers: { host: 'example.com' } };
    const resultUrls = getUrls(req);

    expect(resultUrls.redirectUri).toEqual(
      'http://example.com/api/auth/callback'
    );
    expect(resultUrls.returnTo).toEqual('http://example.com/datasets');
    expect(resultUrls.signOutPage).toEqual('http://example.com/sign-out');
  });

  it('should return https urls', () => {
    vi.stubEnv('APP_USE_HTTPS', 'true');
    const req = { headers: { host: 'example.com' } };
    const resultUrls = getUrls(req);

    expect(resultUrls.redirectUri).toEqual(
      'https://example.com/api/auth/callback'
    );
    expect(resultUrls.returnTo).toEqual('https://example.com/datasets');
    expect(resultUrls.signOutPage).toEqual('https://example.com/sign-out');
    vi.unstubAllEnvs();
  });

  it('should respect referer in request header and return correct returnTo URL', () => {
    const req = {
      headers: { host: 'example.com', referer: 'http://example.com/settings' }
    };
    const resultUrls = getUrls(req);

    expect(resultUrls.returnTo).toEqual('http://example.com/settings');
  });

  it('should respect no referer in request header and return default returnTo URL', () => {
    const req = {
      headers: { host: 'example.com' }
    };
    const resultUrls = getUrls(req);

    expect(resultUrls.returnTo).toEqual('http://example.com/datasets');
  });

  it('should respect no referer in request header and return default returnTo URL', () => {
    const req = {
      headers: { host: 'example.com' }
    };
    const resultUrls = getUrls(req);

    expect(resultUrls.returnTo).toEqual('http://example.com/datasets');
  });

  it('should not respect referer in request header when /sign-out in referer', () => {
    const req = {
      headers: { host: 'example.com', referer: 'http://example.com/sign-out' }
    };
    const resultUrls = getUrls(req);

    expect(resultUrls.returnTo).toEqual('http://example.com/datasets');
  });

  it('should respect query parameters passed with returnPath in login redirect', () => {
    const req = {
      headers: { host: 'example.com' },
      url: 'http://example.com/datasets?returnPath=/datasets?search=foo'
    };
    const resultUrls = getUrls(req);

    expect(resultUrls.returnTo).toEqual(
      'http://example.com/datasets?search=foo'
    );
  });

  it('should respect multiple query parameters passed with returnPath in login redirect', () => {
    const req = {
      headers: { host: 'example.com' },
      url: 'http://example.com/datasets?returnPath=/datasets?search=foo&order.field=name&order.direction=asc'
    };
    const resultUrls = getUrls(req);

    expect(resultUrls.returnTo).toEqual(
      'http://example.com/datasets?search=foo&order.field=name&order.direction=asc'
    );
  });
});
