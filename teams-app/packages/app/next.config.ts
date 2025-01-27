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
  reactStrictMode: getBoolean("REACT_STRICT_MODE", true),
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

    config.module.rules.push({
      test: /\.svg$/,
      // Using asset modules instead of file-loader
      type: "asset",
      generator: {
        filename: "static/images/[hash][ext]",
      },
    });

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
