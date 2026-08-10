/* eslint-disable */

const fs = require("fs");
const path = require("path");

// Shrinking allow-list for the Recoil->Jotai migration. See
// .recoil-allowlist.txt for the rationale; remove files from it as they're
// migrated instead of adding to it.
const readAllowlist = (name) =>
  fs
    .readFileSync(path.join(__dirname, name), "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

const recoilAllowlist = readAllowlist(".recoil-allowlist.txt");

// Shrinking allow-list for the keyboard-shortcuts consolidation. Files here
// still own a raw key listener; everything else must register with
// @fiftyone/keymap. See .keymap-allowlist.txt.
const keymapAllowlist = readAllowlist(".keymap-allowlist.txt");

const NO_RAW_KEY_LISTENERS = [
  {
    selector:
      "CallExpression[callee.property.name=/^(add|remove)EventListener$/] > Literal[value=/^key(down|up|press)$/]",
    message:
      "Key handling belongs on the keymap bus, not a raw listener: a listener registered here can't be seen, listed, or remapped by Settings ▸ Keyboard Shortcuts, and can't be arbitrated against the other handlers for the same key. Use useKeyBinding / useHoldBinding / useDismissable from @fiftyone/keymap. See .keymap-allowlist.txt.",
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
    "no-restricted-syntax": ["warn", ...NO_RAW_KEY_LISTENERS],
    "no-restricted-imports": [
      "warn",
      {
        paths: [
          {
            name: "recoil",
            message:
              "New Recoil usage is frozen during the Recoil->Jotai migration. Use an existing @fiftyone/state accessor hook, or add a new Jotai atom. See .recoil-allowlist.txt.",
          },
          {
            name: "recoil-relay",
            message:
              "New recoil-relay usage is frozen during the Recoil->Jotai migration. See .recoil-allowlist.txt.",
          },
        ],
      },
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
      // Files not yet migrated off Recoil. Shrink .recoil-allowlist.txt as
      // each migration phase lands rather than adding to it.
      files: recoilAllowlist,
      rules: {
        "no-restricted-imports": "off",
      },
    },
    {
      // @fiftyone/keymap *is* the single listener the rule exists to protect.
      files: ["packages/keymap/**"],
      rules: {
        "no-restricted-syntax": "off",
      },
    },
    {
      // Files that still own a raw key listener. Shrink
      // .keymap-allowlist.txt as each surface migrates.
      files: keymapAllowlist,
      rules: {
        "no-restricted-syntax": "off",
      },
    },
  ],
};
