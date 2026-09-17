/* eslint-disable */

const fs = require("fs");
const path = require("path");

// Shrinking allow-list for the MUI->Voodoo migration. See .mui-allowlist.txt
// for the rationale; remove files from it as they're migrated instead of
// adding to it.
const muiAllowlist = fs
  .readFileSync(path.join(__dirname, ".mui-allowlist.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

// Shrinking allow-list for reading the store straight from a component. See
// .reverb-allowlist.txt for the rationale; remove files from it as they move
// to a semantic hook instead of adding to it.
const reverbAllowlist = fs
  .readFileSync(path.join(__dirname, ".reverb-allowlist.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

// Files on both lists, so the per-rule overrides below can exempt them from
// both without exempting either list from the other rule.
const bothAllowlist = reverbAllowlist.filter((file) =>
  muiAllowlist.includes(file),
);

// The store is defined and exposed here, so these own the direct imports.
const storePackages = [
  "packages/state/**",
  "packages/relay/**",
  "packages/reverb/**",
];

// Both rules share the no-restricted-imports rule name, and an ESLint override
// replaces a rule's config rather than merging it. Keep each one's config
// separate so an override can re-apply just the one that still applies.
const reverbPaths = [
  {
    name: "@fiftyone/reverb",
    message:
      "Components should not read or write the store directly. Use a well-defined semantic hook from @fiftyone/state, or add one there. See .reverb-allowlist.txt.",
  },
];

const muiPatterns = [
  {
    group: ["@mui/icons-material", "@mui/icons-material/*"],
    message:
      "New @mui/icons-material usage is frozen during the MUI->Voodoo migration. Use Icons from @voxel51/voodo instead. See .mui-allowlist.txt.",
  },
  {
    group: ["@mui/material", "@mui/material/*"],
    message:
      "New @mui/material usage is frozen during the MUI->Voodoo migration. Use an existing @voxel51/voodo component, or flag a gap to the Voodoo owners if one doesn't exist yet. See .mui-allowlist.txt.",
  },
];

module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
    JSX: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: [
    "react",
    "@typescript-eslint",
    "prettier",
    "react-hooks",
    "only-warn",
  ],
  rules: {
    // must disable base rule for typescript no-unused-vars to take effect
    "no-unused-vars": "off",
    // allow unused vars that have the underscore prefix
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_|React",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    // allow namespace for type export
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "react/display-name": "off",
    "react/no-unknown-property": [
      "warn",
      {
        // this is for react-three-fiber props
        ignore: [
          "object",
          "attach",
          "rotation",
          "position",
          "args",
          "linewidth",
          "transparent",
        ],
      },
    ],
    "react/prop-types": 0,
    "no-restricted-imports": [
      "warn",
      { paths: reverbPaths, patterns: muiPatterns },
    ],
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  overrides: [
    {
      // react-three-fiber renders three.js object properties as JSX props
      files: ["packages/looker-3d/**"],
      rules: {
        "react/no-unknown-property": [
          "warn",
          {
            ignore: [
              "angle",
              "args",
              "attach",
              "decay",
              "depthTest",
              "depthWrite",
              "dispose",
              "distance",
              "emissive",
              "emissiveIntensity",
              "fragmentShader",
              "geometry",
              "glslVersion",
              "intensity",
              "linewidth",
              "map",
              "material",
              "matrix",
              "matrixAutoUpdate",
              "object",
              "onPointerMissed",
              "penumbra",
              "polygonOffset",
              "polygonOffsetFactor",
              "polygonOffsetUnits",
              "position",
              "quaternion",
              "raycast",
              "renderOrder",
              "rotation",
              "side",
              "sizeAttenuation",
              "transparent",
              "uniforms",
              "userData",
              "vertexShader",
              "visible",
              "wireframe",
            ],
          },
        ],
      },
    },
    {
      // @fiftyone/state, @fiftyone/relay and @fiftyone/reverb define the store
      // and the hooks over it, so they import it directly. The MUI rule still
      // applies to them.
      files: storePackages,
      rules: {
        "no-restricted-imports": ["warn", { patterns: muiPatterns }],
      },
    },
    {
      // Files not yet migrated off MUI. Shrink .mui-allowlist.txt as files
      // move to @voxel51/voodo rather than adding to it.
      files: muiAllowlist,
      rules: {
        "no-restricted-imports": ["warn", { paths: reverbPaths }],
      },
    },
    {
      // Files still reading the store directly. Shrink .reverb-allowlist.txt
      // as files move to a semantic hook rather than adding to it.
      files: reverbAllowlist,
      rules: {
        "no-restricted-imports": ["warn", { patterns: muiPatterns }],
      },
    },
    {
      // On both lists, so neither rule applies.
      files: bothAllowlist,
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};
