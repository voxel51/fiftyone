import CaseSensitivePathsPlugin from "case-sensitive-paths-webpack-plugin";
import type { NextConfig } from "next";
import path from "path";

// helper function for boolean env vars
const getBoolean = (name: string, defaultValue: boolean): boolean => {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value === "true";
};

// we resolve these modules to the node_modules directory in the root of the monorepo
const SINGLE_INSTANCE_MODULES_1 = [
  "@motionone",
  "@mui",
  "@react-three/fiber",
  "@react-three/drei",
  "react",
  "recoil",
  "react-relay",
  "recoil-relay",
  "styled-components",
  "three",
]
  .map((module) => ({
    [module]: path.resolve(__dirname, `../../node_modules/${module}`),
  }))
  .reduce((el, acc) => ({ ...acc, ...el }));

// we resolve these modules to the node_modules directory in the root of current package
const SINGLE_INSTANCE_MODULES_2 = ["next", "notistack"]
  .map((module) => ({
    [module]: path.resolve(__dirname, `./node_modules/${module}`),
  }))
  .reduce((el, acc) => ({ ...acc, ...el }));

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // we need strict mode to be off
  // because one of our dependencies (react-draggable) uses an API that is not supported in strict mode
  // see https://github.com/react-grid-layout/react-draggable/blob/a61bd5feaee52f753375ab1955cafe3881b2bc14/lib/DraggableCore.js#L168
  reactStrictMode: getBoolean("REACT_STRICT_MODE", false),
  output: "standalone",

  // note: next has built-in module transpilation
  transpilePackages: [
    "@fiftyone/analytics",
    "@fiftyone/aggregations",
    "@fiftyone/components",
    "@fiftyone/embeddings",
    "@fiftyone/core",
    "@fiftyone/flashlight",
    "@fiftyone/looker",
    "@fiftyone/map",
    "@fiftyone/operators",
    "@fiftyone/plugins",
    "@fiftyone/relay",
    "@fiftyone/spaces",
    "@fiftyone/spotlight",
    "@fiftyone/state",
    "@fiftyone/utilities",
    "@fiftyone/teams-components",
    "@fiftyone/teams-state",
    "@fiftyone/hooks",
    "@fiftyone/teams-utilities",
    "@fiftyone/playback",
  ],

  webpack: (config) => {
    // alias configurations
    config.resolve.alias = {
      ...config.resolve.alias,
      ...SINGLE_INSTANCE_MODULES_1,
      ...SINGLE_INSTANCE_MODULES_2,
      electron: path.resolve(__dirname, "./mockElectron.js"),
    };

    config.plugins.push(new CaseSensitivePathsPlugin());

    // grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find((rule: any) =>
      rule.test?.test?.(".svg")
    );

    config.module.rules.push(
      // reapply the existing rule, but only for svg imports NOT ending in ?react
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: { not: [...fileLoaderRule.resourceQuery.not, /react/] }, // *.svg?react
      },
      // convert only the imports ending in ?react to React components
      {
        test: /\.svg$/i,
        issuer: fileLoaderRule.issuer,
        resourceQuery: /react/, // *.svg?react
        use: ["@svgr/webpack"],
      }
    );

    // modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i;

    return config;
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },

  redirects: async () => [
    {
      source: "/",
      destination: "/datasets",
      permanent: true,
    },
    {
      source: "/datasets/:slug",
      destination: "/datasets/:slug/samples",
      permanent: true,
    },
  ],

  serverRuntimeConfig: {
    fiftyone: {
      serverPathPrefix:
        process.env.FIFTYONE_SERVER_PATH_PREFIX || "/api/proxy/fiftyone-teams",
      serverAddress: process.env.FIFTYONE_SERVER_ADDRESS || "",
    },
  },

  pageExtensions: ["tsx"],

  rewrites: async () =>
    process.env.NODE_ENV === "development"
      ? [
          {
            source: "/cas/:path*",
            destination: `${process.env.CAS_URL}/cas/:path*`,
          },
        ]
      : [],

  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ],
    },
  ],
};

export default nextConfig;
