/* eslint-disable */

const fs = require("fs");
const path = require("path");

// Shrinking allow-list for the Recoil->Jotai migration. See
// .recoil-allowlist.txt for the rationale; remove files from it as they're
// migrated instead of adding to it.
const recoilAllowlist = fs
  .readFileSync(path.join(__dirname, ".recoil-allowlist.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

// Shrinking allow-list for the MUI->Voodoo migration. See .mui-allowlist.txt
// for the rationale; remove files from it as they're migrated instead of
// adding to it.
const muiAllowlist = fs
  .readFileSync(path.join(__dirname, ".mui-allowlist.txt"), "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

// Files frozen for both migrations, so the per-migration overrides below can
// exempt them from both without exempting either list from the other freeze.
const bothAllowlist = recoilAllowlist.filter((file) =>
  muiAllowlist.includes(file),
);

// The two freezes share the no-restricted-imports rule name, and an ESLint
// override replaces a rule's config rather than merging it. Keep each freeze's
// config separate so an override can re-apply just the one that still applies.
const recoilPaths = [
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

const E2E_STANDARDS = "See e2e-pw/CODING_STANDARDS.md (App events).";
const DOM_EVENT_MESSAGE = `App code doesn't build or dispatch DOM events; send on the @fiftyone/events bus (an e2e: event for a test signal), or a LocalEventTarget for an object whose listeners attach to it alone. ${E2E_STANDARDS}`;
const DOM_EVENT_NAME = "/^([A-Z]\\w*)?Event$/";
const domEventSyntax = [
  {
    selector: `NewExpression[callee.name=${DOM_EVENT_NAME}]`,
    message: DOM_EVENT_MESSAGE,
  },
  {
    selector: `:matches(ClassDeclaration, ClassExpression)[superClass.name=${DOM_EVENT_NAME}]`,
    message: DOM_EVENT_MESSAGE,
  },
  {
    // target.dispatchEvent(event); a looker's dispatchEvent("name", detail) is
    // its own bus
    selector:
      "CallExpression:matches([callee.property.name='dispatchEvent'], [callee.name='dispatchEvent'])[arguments.length=1]:not([arguments.0.type=/^(Literal|TemplateLiteral)$/])",
    message: DOM_EVENT_MESSAGE,
  },
];
const automationGuardSyntax = [
  {
    selector: "Identifier[name=/^(isE2E|IS_PLAYWRIGHT)$/]",
    message: `App code doesn't branch on browser automation; dispatch e2e: events unconditionally and the bus drops them outside it. ${E2E_STANDARDS}`,
  },
  {
    selector:
      "MemberExpression[object.name='navigator'][property.name='webdriver']",
    message: `App code doesn't branch on browser automation; dispatch e2e: events unconditionally and the bus drops them outside it. ${E2E_STANDARDS}`,
  },
];

// The bus's own automation check: it drops e2e: events outside automation and
// exposes its tap under it
const automationCheckFiles = [
  "packages/events/src/dispatch/dispatcher.ts",
  "packages/events/src/dispatch/registry.ts",
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
      { paths: recoilPaths, patterns: muiPatterns },
    ],
    "no-restricted-syntax": [
      "warn",
      ...domEventSyntax,
      ...automationGuardSyntax,
    ],
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  overrides: [
    {
      // the bus, and its deprecated mirror of a closed list of bus events to
      // the DOM events main sent, pinned by e2e-pw/scripts/check-e2e-events.py
      files: ["packages/events/src/dispatch/**"],
      rules: {
        "no-restricted-syntax": ["warn", ...automationGuardSyntax],
      },
    },
    {
      files: automationCheckFiles,
      rules: {
        "no-restricted-syntax": "off",
      },
    },
    {
      // tests stand in for the App's own events and the automation flag
      files: [
        "**/*.{test,spec}.{js,jsx,ts,tsx}",
        "**/__tests__/**",
        "**/__mocks__/**",
        "packages/*/tests/**",
      ],
      rules: {
        "no-restricted-syntax": "off",
      },
    },
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
      // each migration phase lands rather than adding to it. The MUI freeze
      // still applies here, so re-declare it.
      files: recoilAllowlist,
      excludedFiles: muiAllowlist,
      rules: {
        "no-restricted-imports": ["warn", { patterns: muiPatterns }],
      },
    },
    {
      // Files not yet migrated off MUI. Shrink .mui-allowlist.txt as files
      // move to @voxel51/voodo rather than adding to it. The Recoil freeze
      // still applies here, so re-declare it.
      files: muiAllowlist,
      excludedFiles: recoilAllowlist,
      rules: {
        "no-restricted-imports": ["warn", { paths: recoilPaths }],
      },
    },
    {
      // On both allowlists: exempt from both freezes until one of them is
      // migrated, at which point it drops back to a single-list override.
      files: bothAllowlist,
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};
