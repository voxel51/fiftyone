import {
  DEFAULT_PROXY_TARGET,
  FIFTYONE_TEAMS_PROXY_ENDPOINT,
  NEXTJS_PROXY_TIMEOUT
} from '@fiftyone/teams-state/src/constants';
import { NextApiRequest, NextApiResponse } from 'next';
import httpProxyMiddleware from 'next-http-proxy-middleware';

export const config = {
  api: {
    // Enable `externalResolver` option in Next.js
    externalResolver: true,
    bodyParser: {
      sizeLimit: '64mb'
    }
  }
};

const { FIFTYONE_TEAMS_PROXY_URL, FIFTYONE_TEAMS_PLUGIN_URL } = process.env;

const PLUGIN_ROUTES = [
  `${FIFTYONE_TEAMS_PROXY_ENDPOINT}/plugins`,
  `${FIFTYONE_TEAMS_PROXY_ENDPOINT}/operators`
];

function isPluginPath(path: string) {
  for (const pluginRoute of PLUGIN_ROUTES) {
    if (path.startsWith(pluginRoute)) {
      return true;
    }
  }
  return false;
}

function getTargetForUrl(url: string | undefined) {
  if (url === undefined) throw new Error('No URL provided');
  let target = null;
  if (isPluginPath(url)) {
    target = FIFTYONE_TEAMS_PLUGIN_URL || FIFTYONE_TEAMS_PROXY_URL;
  } else {
    target = FIFTYONE_TEAMS_PROXY_URL;
  }
  return typeof target === 'string' ? target : DEFAULT_PROXY_TARGET;
}

export default (req: NextApiRequest, res: NextApiResponse) => {
  return httpProxyMiddleware(req, res, {
    target: getTargetForUrl(req.url),
    pathRewrite: [
      {
        patternStr: `^${FIFTYONE_TEAMS_PROXY_ENDPOINT}`,
        replaceStr: '/'
      }
    ],
    proxyTimeout: NEXTJS_PROXY_TIMEOUT
  });
};
