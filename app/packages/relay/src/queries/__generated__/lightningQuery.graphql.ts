/**
 * @generated SignedSource<<878d89c6671cfbad0a8fe887ae7ddb17>>
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
    readonly path: string;
    readonly true: boolean;
  } | {
    readonly __typename: "DateLightningResult";
    readonly dateMax: number | null;
    readonly dateMin: number | null;
    readonly path: string;
  } | {
    readonly __typename: "DateTimeLightningResult";
    readonly datetimeMax: number | null;
    readonly datetimeMin: number | null;
    readonly path: string;
  } | {
    readonly __typename: "FloatLightningResult";
    readonly inf: boolean;
    readonly max: number | null;
    readonly min: number | null;
    readonly nan: boolean;
    readonly ninf: boolean;
    readonly path: string;
  } | {
    readonly __typename: "IntLightningResult";
    readonly intMax: number | null;
    readonly intMin: number | null;
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
v2 = [
  (v1/*: any*/),
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "values",
    "storageKey": null
  }
],
v3 = [
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
          }
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
          }
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
          }
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
          }
        ],
        "type": "FloatLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v2/*: any*/),
        "type": "ObjectIdLightningResult",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": (v2/*: any*/),
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
    "selections": (v3/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "lightningQuery",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "55b3745ca13a2178557414d23b071012",
    "id": null,
    "metadata": {},
    "name": "lightningQuery",
    "operationKind": "query",
    "text": "query lightningQuery(\n  $input: LightningInput!\n) {\n  lightning(input: $input) {\n    __typename\n    ... on BooleanLightningResult {\n      path\n      false\n      true\n    }\n    ... on IntLightningResult {\n      path\n      intMax: max\n      intMin: min\n    }\n    ... on DateLightningResult {\n      path\n      dateMax: max\n      dateMin: min\n    }\n    ... on DateTimeLightningResult {\n      path\n      datetimeMax: max\n      datetimeMin: min\n    }\n    ... on FloatLightningResult {\n      path\n      inf\n      max\n      min\n      nan\n      ninf\n    }\n    ... on ObjectIdLightningResult {\n      path\n      values\n    }\n    ... on StringLightningResult {\n      path\n      values\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f4f8b5069a4ac276ea169fb0415f165f";

export default node;
