/**
 * @generated SignedSource<<e18d763b5048c83b0ba06ace4b52f593>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type LightningInput = {
  dataset: string;
  paths: ReadonlyArray<LightningPathInput>;
};
export type LightningPathInput = {
  exclude?: ReadonlyArray<string> | null;
  filters?: object | null;
  first?: number | null;
  path: string;
  search?: string | null;
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
    readonly dateMax: number | null;
    readonly dateMin: number | null;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "DateTimeLightningResult";
    readonly datetimeMax: number | null;
    readonly datetimeMin: number | null;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "FloatLightningResult";
    readonly inf: boolean;
    readonly max: number | null;
    readonly min: number | null;
    readonly nan: boolean;
    readonly ninf: boolean;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "IntLightningResult";
    readonly intMax: number | null;
    readonly intMin: number | null;
    readonly none: boolean;
    readonly path: string;
  } | {
    readonly __typename: "ObjectIdLightningResult";
    readonly path: string;
    readonly values: ReadonlyArray<string | null> | null;
  } | {
    readonly __typename: "StringLightningResult";
    readonly path: string;
    readonly values: ReadonlyArray<string | null> | null;
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
  (v1/*: any*/),
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
          (v1/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "false",
            "storageKey": null
          },
          (v2/*: any*/),
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
          (v1/*: any*/),
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
          (v2/*: any*/)
        ],
        "type": "IntLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*: any*/),
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
          (v2/*: any*/)
        ],
        "type": "DateLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*: any*/),
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
          (v2/*: any*/)
        ],
        "type": "DateTimeLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*: any*/),
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
          (v2/*: any*/)
        ],
        "type": "FloatLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v3/*: any*/),
        "type": "ObjectIdLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v3/*: any*/),
        "type": "StringLightningResult",
        "abstractKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "lightningQuery",
    "selections": (v4/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "lightningQuery",
    "selections": (v4/*: any*/)
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
