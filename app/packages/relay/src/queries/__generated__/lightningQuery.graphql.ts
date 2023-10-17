/**
 * @generated SignedSource<<b6c5232a88a613ca3d4804b1ee4ac190>>
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
    readonly __typename: string;
    readonly dateMax?: number | null;
    readonly dateMin?: number | null;
    readonly datetimeMax?: number | null;
    readonly datetimeMin?: number | null;
    readonly false?: boolean;
    readonly inf?: boolean;
    readonly intMax?: number | null;
    readonly intMin?: number | null;
    readonly max?: number | null;
    readonly min?: number | null;
    readonly nan?: boolean;
    readonly ninf?: boolean;
    readonly path?: string;
    readonly true?: boolean;
    readonly values?: ReadonlyArray<string | null>;
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
v1 = [
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
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "path",
            "storageKey": null
          }
        ],
        "type": "LightningResult",
        "abstractKey": "__isLightningResult"
      },
      {
        "kind": "InlineFragment",
        "selections": [
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
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "values",
            "storageKey": null
          }
        ],
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
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "lightningQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "918718c98ea4b406823e7f51b6862540",
    "id": null,
    "metadata": {},
    "name": "lightningQuery",
    "operationKind": "query",
    "text": "query lightningQuery(\n  $input: LightningInput!\n) {\n  lightning(input: $input) {\n    __typename\n    ... on LightningResult {\n      __isLightningResult: __typename\n      path\n    }\n    ... on BooleanLightningResult {\n      false\n      true\n    }\n    ... on IntLightningResult {\n      intMax: max\n      intMin: min\n    }\n    ... on DateLightningResult {\n      dateMax: max\n      dateMin: min\n    }\n    ... on DateTimeLightningResult {\n      datetimeMax: max\n      datetimeMin: min\n    }\n    ... on FloatLightningResult {\n      inf\n      max\n      min\n      nan\n      ninf\n    }\n    ... on StringLightningResult {\n      values\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "498ef5c9558f882122beef6bc42cc303";

export default node;
