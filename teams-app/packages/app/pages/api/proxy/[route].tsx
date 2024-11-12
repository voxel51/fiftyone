import {
  API_URL,
  NEXTJS_PROXY_TIMEOUT,
} from "@fiftyone/teams-state/src/constants";
import httpProxy from "http-proxy";
import { NextApiRequest, NextApiResponse } from "next";
import httpProxyMiddleware from "next-http-proxy-middleware";

export const config = {
  api: {
    // Enable `externalResolver` option in Next.js
    externalResolver: true,
    // Required for file upload. Next.js bodyParser seems to corrupt multipart
    bodyParser: false,
  },
};

const API_PROXY_ENDPOINT = "/api/proxy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const handleProxyInit = (proxy: httpProxy) => {
    let proxyPath: string;
    let currentPage: string;
    let start: number;
    proxy.on("proxyReq", (proxyReq, req, res) => {
      start = Date.now();
      proxyReq.path = proxyReq.path.replace(/-/g, "/");
      proxyPath = proxyReq.path;
      currentPage = req.headers.referer
        ? new URL(req.headers.referer).pathname
        : "/";
    });
    proxy.on("error", (err) => {
      console.error("Proxy Request Error (Code: 5101)");
      console.error("Proxy URL:", API_URL);
      console.error("Incoming path:", req.url);
      console.error("Proxy path:", proxyPath || req.url);
      console.error(err);
      res.status(503).json({ error: err });
    });
    proxy.on("proxyRes", (proxyRes, req, res) => {
      const elapsed = (Date.now() - start) / 1000;
      console.debug(`current page: ${currentPage}`);
      console.log(
        `${proxyRes.statusCode} ${req.method} (${elapsed}s) ${req.url} => ${API_URL}${proxyPath}`
      );
    });
  };
  return httpProxyMiddleware(req, res, {
    target: API_URL,
    pathRewrite: [
      {
        patternStr: `^${API_PROXY_ENDPOINT}`,
        replaceStr: "",
      },
    ],
    onProxyInit: handleProxyInit,
    proxyTimeout: NEXTJS_PROXY_TIMEOUT,
  });
}
