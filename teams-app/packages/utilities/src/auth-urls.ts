// NextApiRequest
const PARAM_KEY = '?returnPath=';

export function getUrls(req: any) {
  const { APP_USE_HTTPS } = process.env;
  const protocol = APP_USE_HTTPS == 'true' ? 'https' : 'http';
  const host = req.headers['host'];
  const referer = req.headers['referer'];
  const base = `${protocol}://${host}`;
  let from: string | undefined;

  // if we came from any other page on the app except sign-out, redirect back to that page
  if (referer?.indexOf(base) === 0 && referer.indexOf('/sign-out') === -1) {
    from = referer?.replace(base, '');
  }

  const decodedUrl = req?.url ? decodeURIComponent(req.url) : '';
  const returnPathIndex = decodedUrl.indexOf(PARAM_KEY);
  const returnPath =
    returnPathIndex !== -1
      ? decodedUrl.substring(returnPathIndex + PARAM_KEY.length)
      : null;

  const redirectUri = `${base}/api/auth/callback`;
  const returnTo = `${base}` + (from ?? returnPath ?? '/datasets');
  const signOutPage = `${base}` + '/sign-out';

  return {
    redirectUri,
    returnTo,
    signOutPage
  };
}
