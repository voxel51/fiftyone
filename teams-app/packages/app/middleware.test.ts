import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'secret';
const JWT_ALGORITHM = 'HS256';

import { getSessionCookieName } from '@fiftyone/teams-utilities';

const SESSION_REDIRECT_URL =
  'http://localhost/cas/api/auth/session?redirect=%2Fdatasets%3Fpage%3D1%26pageSize%3D50';

describe('middleware: path regexp', async () => {
  vi.stubEnv('FIFTYONE_AUTH_SECRET', SECRET);
  vi.stubEnv('NEXTAUTH_BASEPATH', '/cas');

  const { config, middleware } = await import('./middleware');
  const redirectSpy = vi.spyOn(NextResponse, 'redirect');
  const nextSpy = vi.spyOn(NextResponse, 'next');
  const baseMockRequest = {
    url: 'http://localhost/datasets?page=1&pageSize=50',
    nextUrl: new URL('http://localhost/datasets?page=1&pageSize=50')
  };
  const cookieName = getSessionCookieName();

  beforeEach(() => {
    redirectSpy.mockReset();
    nextSpy.mockReset();
  });

  it('requires authentication for protected routes', () => {
    const pattern = new RegExp(config.matcher);
    for (const route of protectedRoutes) {
      const { index } = pattern.exec(route) || {};
      expect(index).toBe(0);
    }
  });

  it('does not requires authentication for unprotected routes', () => {
    const pattern = new RegExp(config.matcher);
    for (const route of unprotectedRoutes) {
      const { index } = pattern.exec(route) || {};
      expect(index).not.toBe(0);
    }
  });

  it('redirects user to sign in if session is not found', async () => {
    const mockGetCookie = getCookieMock(() => undefined);
    const mockRequest = { ...baseMockRequest, cookies: { get: mockGetCookie } };
    await middleware(mockRequest);
    expect(mockRequest.cookies.get).toBeCalledWith(cookieName);
    expect(redirectSpy).toBeCalled();
    expect(nextSpy).not.toBeCalled();
    expect(redirectSpy.mock.lastCall?.[0].href).toBe(SESSION_REDIRECT_URL);
  });

  it('redirects user to sign in if session is not valid', async () => {
    const mockGetCookie = getCookieMock(() => 'invalid-jwt');
    const mockRequest = { ...baseMockRequest, cookies: { get: mockGetCookie } };
    await middleware(mockRequest);
    expect(mockRequest.cookies.get).toBeCalledWith(cookieName);
    expect(redirectSpy).toBeCalled();
    expect(nextSpy).not.toBeCalled();
    expect(redirectSpy.mock.lastCall?.[0].href).toBe(SESSION_REDIRECT_URL);
  });

  it('redirects user to sign in if session is expired', async () => {
    const newYearInSeconds = new Date('Jan 1 2024').getTime() / 1000;
    const jwt = await getJWT({ exp: newYearInSeconds });
    const mockGetCookie = getCookieMock(() => jwt);
    const mockRequest = { ...baseMockRequest, cookies: { get: mockGetCookie } };
    await middleware(mockRequest);
    expect(mockRequest.cookies.get).toBeCalledWith(cookieName);
    expect(redirectSpy).toBeCalled();
    expect(nextSpy).not.toBeCalled();
    expect(redirectSpy.mock.lastCall?.[0].href).toBe(SESSION_REDIRECT_URL);
  });

  it('allows user to pass-through to the endpoint if session is valid', async () => {
    const jwt = await getJWT({ exp: Date.now() + 3600 });
    const mockGetCookie = getCookieMock(() => jwt);
    const mockRequest = { ...baseMockRequest, cookies: { get: mockGetCookie } };
    await middleware(mockRequest);
    expect(mockRequest.cookies.get).toBeCalledWith(cookieName);
    expect(redirectSpy).not.toBeCalled();
    expect(nextSpy).toBeCalled();
  });
});

const protectedRoutes = [
  '/',
  '/api',
  '/datasets',
  '/proxy',
  '/settings',
  '/settings/team',
  '/datasets/quickstart/samples'
];
const unprotectedRoutes = [
  '/cas',
  '/api/hello',
  '/_next/static',
  '/_next/image',
  'favicon.ico'
];

function getCookieMock(implementation) {
  const defaultImplementation = () => undefined;
  return vi.fn(implementation || defaultImplementation);
}

async function getJWT(payload: any) {
  const key = new TextEncoder().encode(SECRET as string);

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .sign(key);

  return jwt;
}
