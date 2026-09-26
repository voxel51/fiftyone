/**
 * @generated SignedSource<<c7cf67f8450675547f9453c5fa709d14>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type LightningInput = {
  dataset: string;
  match?: object | null | undefined;
  paths: ReadonlyArray<LightningPathInput>;
  slice?: string | null | undefined;
};
export type LightningPathInput = {
  exclude?: ReadonlyArray<string> | null | undefined;
  filters?: object | null | undefined;
  first?: number | null | undefined;
  index?: string | null | undefined;
  maxDocumentsSearch?: number | null | undefined;
  path: string;
  search?: string | null | undefined;
};
export type lightningQuery$variables = {
  input: LightningInput;
};
export type lightningQuery$data = {
  readonly lightning: ReadonlyArray<{
    readonly __typename: "BooleanLightningResult";
    readonly false: boolean;
    readonly none: boolean;
    readonly path: string;
    readonly true: boolean;
  } | {
    readonly __typename: "DateLightningResult";
    readonly dateMax: number | null | undefined;
    readonly dateMin: number | null | undefined;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "DateTimeLightningResult";
    readonly datetimeMax: number | null | undefined;
    readonly datetimeMin: number | null | undefined;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "FloatLightningResult";
    readonly inf: boolean;
    readonly max: number | null | undefined;
    readonly min: number | null | undefined;
    readonly nan: boolean;
    readonly ninf: boolean;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "IntLightningResult";
    readonly intMax: number | null | undefined;
    readonly intMin: number | null | undefined;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "ObjectIdLightningResult";
    readonly path: string;
    readonly values: ReadonlyArray<string | null | undefined> | null | undefined;
  } | {
    readonly __typename: "StringLightningResult";
    readonly path: string;
    readonly values: ReadonlyArray<string | null | undefined> | null | undefined;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  }>;
};
export type lightningQuery = {
  response: lightningQuery$data;
  variables: lightningQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "input"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "none",
  "storageKey": null
},
v3 = [
  (v1/*:: as any*/),
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "values",
    "storageKey": null
  }
],
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "input",
        "variableName": "input"
      }
    ],
    "concreteType": null,
    "kind": "LinkedField",
    "name": "lightning",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "__typename",
        "storageKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "false",
            "storageKey": null
          },
          (v2/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "true",
            "storageKey": null
          }
        ],
        "type": "BooleanLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          {
            "alias": "intMax",
            "args": null,
            "kind": "ScalarField",
            "name": "max",
            "storageKey": null
          },
          {
            "alias": "intMin",
            "args": null,
            "kind": "ScalarField",
            "name": "min",
            "storageKey": null
          },
          (v2/*:: as any*/)
        ],
        "type": "IntLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          {
            "alias": "dateMax",
            "args": null,
            "kind": "ScalarField",
            "name": "max",
            "storageKey": null
          },
          {
            "alias": "dateMin",
            "args": null,
            "kind": "ScalarField",
            "name": "min",
            "storageKey": null
          },
          (v2/*:: as any*/)
        ],
        "type": "DateLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          {
            "alias": "datetimeMax",
            "args": null,
            "kind": "ScalarField",
            "name": "max",
            "storageKey": null
          },
          {
            "alias": "datetimeMin",
            "args": null,
            "kind": "ScalarField",
            "name": "min",
            "storageKey": null
          },
          (v2/*:: as any*/)
        ],
        "type": "DateTimeLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "inf",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "max",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "min",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "nan",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "ninf",
            "storageKey": null
          },
          (v2/*:: as any*/)
        ],
        "type": "FloatLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v3/*:: as any*/),
        "type": "ObjectIdLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v3/*:: as any*/),
        "type": "StringLightningResult",
        "abstractKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "lightningQuery",
    "selections": (v4/*:: as any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Operation",
    "name": "lightningQuery",
    "selections": (v4/*:: as any*/)
  },
  "params": {
    "cacheID": "b35d938e78bd9e49d107c5edfbc86069",
    "id": null,
    "metadata": {},
    "name": "lightningQuery",
    "operationKind": "query",
    "text": "query lightningQuery(\n  $input: LightningInput!\n) {\n  lightning(input: $input) {\n    __typename\n    ... on BooleanLightningResult {\n      path\n      false\n      none\n      true\n    }\n    ... on IntLightningResult {\n      path\n      intMax: max\n      intMin: min\n      none\n    }\n    ... on DateLightningResult {\n      path\n      dateMax: max\n      dateMin: min\n      none\n    }\n    ... on DateTimeLightningResult {\n      path\n      datetimeMax: max\n      datetimeMin: min\n      none\n    }\n    ... on FloatLightningResult {\n      path\n      inf\n      max\n      min\n      nan\n      ninf\n      none\n    }\n    ... on ObjectIdLightningResult {\n      path\n      values\n    }\n    ... on StringLightningResult {\n      path\n      values\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "40dfbfb5ac6158ab470fb9c1cb027071";

export default node;
