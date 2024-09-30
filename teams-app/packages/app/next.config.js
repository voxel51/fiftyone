/** @type {import('next').NextConfig} */
const path = require('path');
const withTM = require('next-transpile-modules')([
  '@fiftyone/analytics',
  '@fiftyone/aggregations',
  '@fiftyone/components',
  '@fiftyone/embeddings',
  '@fiftyone/core',
  '@fiftyone/flashlight',
  '@fiftyone/looker',
  '@fiftyone/map',
  '@fiftyone/operators',
  '@fiftyone/plugins',
  '@fiftyone/relay',
  '@fiftyone/spaces',
  '@fiftyone/spotlight',
  '@fiftyone/state',
  '@fiftyone/utilities',
  '@fiftyone/teams-components',
  '@fiftyone/teams-state',
  '@fiftyone/hooks',
  '@fiftyone/teams-utilities',
  '@fiftyone/playback',
  // "@fiftyone/lib" @TODO:MANI do we want the lib here too
]);
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');

const nextConfig = withTM({
  api: {
    bodyParser: {
      sizeLimit: '64mb'
    }
  },
  reactStrictMode: getBoolean('REACT_STRICT_MODE', true),
  swcMinify: true,
  output: 'standalone',
  webpack: (config) => {
    config.resolve.alias['@motionone'] = path.resolve(
      __dirname,
      '../../node_modules/@motionone'
    );
    config.resolve.alias['@mui'] = path.resolve(
      __dirname,
      '../../node_modules/@mui'
    );
    config.resolve.alias['@react-three/fiber'] = path.resolve(
      __dirname,
      '../../node_modules/@react-three/fiber'
    );
    config.resolve.alias['@react-three/drei'] = path.resolve(
      __dirname,
      '../../node_modules/@react-three/drei'
    );
    config.resolve.alias.electron = path.resolve(
      __dirname,
      './mockElectron.js'
    );
    config.resolve.alias.next = path.resolve(__dirname, './node_modules/next');
    config.resolve.alias.notistack = path.resolve(
      __dirname,
      './node_modules/notistack'
    );
    config.resolve.alias.react = path.resolve(
      __dirname,
      '../../node_modules/react'
    );
    config.resolve.alias.recoil = path.resolve(
      __dirname,
      '../../node_modules/recoil'
    );
    config.resolve.alias['react-relay'] = path.resolve(
      __dirname,
      '../../node_modules/react-relay'
    );
    config.resolve.alias['recoil-relay'] = path.resolve(
      __dirname,
      '../../node_modules/recoil-relay'
    );
    config.resolve.alias['styled-components'] = path.resolve(
      __dirname,
      '../../node_modules/styled-components'
    );

    config.resolve.alias['three'] = path.resolve(
      __dirname,
      '../../node_modules/three'
    );
    config.plugins.push(new CaseSensitivePathsPlugin());

    config.module.rules.push({
      test: /\.svg$/,
      loader: 'file-loader',
      options: {
        outputPath: 'static/images'
      }
    });

    return config;
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true
  },
  async redirects() {
    // TODO: check if saved view paths need to be added here
    return [
      {
        source: '/',
        destination: '/datasets',
        permanent: true
      },
      {
        source: '/datasets/:slug',
        destination: '/datasets/:slug/samples',
        permanent: true
      }
    ];
  },
  serverRuntimeConfig: {
    fiftyone: {
      serverPathPrefix:
        typeof process.env.FIFTYONE_SERVER_PATH_PREFIX === 'string'
          ? process.env.FIFTYONE_SERVER_PATH_PREFIX
          : '/api/proxy/fiftyone-teams',
      serverAddress:
        typeof process.env.FIFTYONE_SERVER_ADDRESS === 'string'
          ? process.env.FIFTYONE_SERVER_ADDRESS
          : ''
    }
  },
  pageExtensions: ['tsx'],

  async rewrites() {
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/cas/:path*',
            destination: process.env.CAS_URL + `/cas/:path*`
          }
        ]
      : [];
  }
});

module.exports = nextConfig;

function getBoolean(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value === 'true';
}
