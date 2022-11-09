/**
 * @generated SignedSource<<090b86da235e773defb8dd231539abaa>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type countValuesQuery$variables = {
  dataset: string;
  path: string;
  view: Array;
};
export type countValuesQuery$data = {
  readonly aggregate: ReadonlyArray<{
    readonly __typename: "BoolCountValuesResponse";
    readonly values: ReadonlyArray<{
      readonly bool: boolean | null;
      readonly value: number;
    }>;
  } | {
    readonly __typename: "StrCountValuesResponse";
    readonly values: ReadonlyArray<{
      readonly str: string | null;
      readonly value: number;
    }>;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  }>;
};
export type countValuesQuery = {
  response: countValuesQuery$data;
  variables: countValuesQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "dataset"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "path"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "items": [
          {
            "fields": [
              {
                "fields": [
                  {
                    "kind": "Variable",
                    "name": "field",
                    "variableName": "path"
                  }
                ],
                "kind": "ObjectValue",
                "name": "countValues"
              }
            ],
            "kind": "ObjectValue",
            "name": "aggregations.0"
          }
        ],
        "kind": "ListValue",
        "name": "aggregations"
      },
      {
        "kind": "Variable",
        "name": "datasetName",
        "variableName": "dataset"
      },
      {
        "kind": "Variable",
        "name": "view",
        "variableName": "view"
      }
    ],
    "concreteType": null,
    "kind": "LinkedField",
    "name": "aggregate",
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
            "concreteType": "BoolValueCount",
            "kind": "LinkedField",
            "name": "values",
            "plural": true,
            "selections": [
              (v3/*: any*/),
              {
                "alias": "bool",
                "args": null,
                "kind": "ScalarField",
                "name": "key",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "type": "BoolCountValuesResponse",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "StrValueCount",
            "kind": "LinkedField",
            "name": "values",
            "plural": true,
            "selections": [
              (v3/*: any*/),
              {
                "alias": "str",
                "args": null,
                "kind": "ScalarField",
                "name": "key",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "type": "StrCountValuesResponse",
        "abstractKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "countValuesQuery",
    "selections": (v4/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "countValuesQuery",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "9b50dae166f3375585e2a382235a680e",
    "id": null,
    "metadata": {},
    "name": "countValuesQuery",
    "operationKind": "query",
    "text": "query countValuesQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{countValues: {field: $path}}]) {\n    __typename\n    ... on BoolCountValuesResponse {\n      values {\n        value\n        bool: key\n      }\n    }\n    ... on StrCountValuesResponse {\n      values {\n        value\n        str: key\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "587101f597e0a5b5913befc130c655f9";

export default node;
