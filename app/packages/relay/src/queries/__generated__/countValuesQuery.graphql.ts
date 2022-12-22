/**
 * @generated SignedSource<<0cb770c001251345fcf2f0a021830c27>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type ExtendedViewForm = {
  filters?: object | null;
  mixed?: boolean | null;
  sampleIds?: ReadonlyArray<string> | null;
  slice?: string | null;
};
export type countValuesQuery$variables = {
  dataset: string;
  form?: ExtendedViewForm | null;
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
  "name": "form"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "path"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
},
v5 = [
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
        "name": "form",
        "variableName": "form"
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
              (v4/*: any*/),
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
              (v4/*: any*/),
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
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "countValuesQuery",
    "selections": (v5/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "countValuesQuery",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "3e068aebda42556ce84561090eabb51d",
    "id": null,
    "metadata": {},
    "name": "countValuesQuery",
    "operationKind": "query",
    "text": "query countValuesQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $path: String!\n  $form: ExtendedViewForm\n) {\n  aggregate(datasetName: $dataset, view: $view, aggregations: [{countValues: {field: $path}}], form: $form) {\n    __typename\n    ... on BoolCountValuesResponse {\n      values {\n        value\n        bool: key\n      }\n    }\n    ... on StrCountValuesResponse {\n      values {\n        value\n        str: key\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "a17aefad732a7252e2693b8e05b372bb";

export default node;
