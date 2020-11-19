/**
 * Base webpack config used across other specific configs
 */

import path from "path";
import webpack from "webpack";
import { dependencies as externals } from "../app/package.json";
import RewriteImportPlugin from "less-plugin-rewrite-import";
const ROOT_DIR = path.resolve(__dirname, "../");
const NODE_MODULES_DIR = path.resolve(__dirname, "../node_modules");

export default {
  externals: [...Object.keys(externals || {})],

  module: {
    rules: [
      {
        test: /\.(txt|py|bash)$/,
        use: "raw-loader",
      },
      {
        test: /\.(tsx|js|jsx|ts)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            cacheDirectory: true,
          },
        },
      },
      {
        test: /\.less$/,
        use: [
          {
            loader: "style-loader",
          },
          {
            loader: "css-loader",
          },
          {
            loader: "less-loader",
            options: {
              lessOptions: {
                paths: [ROOT_DIR, NODE_MODULES_DIR], // this will force less-loader to use its own resolver, both should be absolute path
                plugins: [
                  new RewriteImportPlugin({
                    paths: {
                      "../../theme.config":
                        __dirname + "/../app/semantic-ui/theme.config",
                    },
                  }),
                ],
              },
            },
          },
        ],
      },
    ],
  },

  output: {
    path: path.join(__dirname, "..", "app"),
    // https://github.com/webpack/webpack/issues/1114
    libraryTarget: "commonjs2",
  },

  /**
   * Determine the array of extensions that should be used to resolve modules.
   */
  resolve: {
    extensions: [".js", ".jsx", ".json", ".ts", ".tsx"],
    modules: [path.join(__dirname, "..", "app"), "node_modules"],
    alias: {
      player51: path.join(__dirname, "../app/player51/"),
    },
  },

  plugins: [
    new webpack.ExternalsPlugin("commonjs", ["electron"]),
    new webpack.EnvironmentPlugin({
      NODE_ENV: "production",
    }),
    new webpack.LoaderOptionsPlugin({
      test: /\.less/, // may apply this only for some modules
      options: {
        loaders: "style!css!less",
      },
    }),

    new webpack.LoaderOptionsPlugin({
      test: /\.(png|jpg|gif|woff|svg|eot|ttf|woff2)$/, // may apply this only for some modules
      options: {
        loaders:
          "url-loader?limit=1024&name=[name]-[hash:8].[ext]!image-webpack",
      },
    }),

    new webpack.NamedModulesPlugin(),
  ],
};
