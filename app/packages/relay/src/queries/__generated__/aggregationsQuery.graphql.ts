/**
 * @generated SignedSource<<2163a053e1776a9b76a989bf7a7f626b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type AggregationForm = {
  dataset: string;
  extendedStages: Array;
  filters?: object | null;
  groupId?: string | null;
  hiddenLabels: ReadonlyArray<SelectedLabel>;
  index?: number | null;
  mixed: boolean;
  paths: ReadonlyArray<string>;
  sampleIds: ReadonlyArray<string>;
  slices?: ReadonlyArray<string> | null;
  view: Array;
  viewName?: string | null;
};
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null;
  labelId: string;
  sampleId: string;
};
export type aggregationsQuery$variables = {
  form: AggregationForm;
};
export type aggregationsQuery$data = {
  readonly aggregations: ReadonlyArray<{
    readonly __typename: string;
    readonly count?: number;
    readonly exists?: number;
    readonly expandedFieldCount?: number;
    readonly false?: number;
    readonly frameLabelFieldCount?: number | null;
    readonly inf?: number;
    readonly max?: number | null;
    readonly min?: number | null;
    readonly nan?: number;
    readonly ninf?: number;
    readonly path?: string;
    readonly slice?: number | null;
    readonly true?: number;
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly value: string;
    }>;
  }>;
};
export type aggregationsQuery = {
  response: aggregationsQuery$data;
  variables: aggregationsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "form"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "count",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "max",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "min",
  "storageKey": null
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "form",
        "variableName": "form"
      }
    ],
    "concreteType": null,
    "kind": "LinkedField",
    "name": "aggregations",
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
          },
          (v1/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "exists",
            "storageKey": null
          }
        ],
        "type": "Aggregation",
        "abstractKey": "__isAggregation"
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
        "type": "BooleanAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/)
        ],
        "type": "IntAggregation",
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
          (v2/*: any*/),
          (v3/*: any*/),
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
        "type": "FloatAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "slice",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "expandedFieldCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "frameLabelFieldCount",
            "storageKey": null
          }
        ],
        "type": "RootAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "StringAggregationValue",
            "kind": "LinkedField",
            "name": "values",
            "plural": true,
            "selections": [
              (v1/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "value",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "type": "StringAggregation",
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
    "name": "aggregationsQuery",
    "selections": (v4/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "aggregationsQuery",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "dadc0977809d96f1e7d1963b5abf37b0",
    "id": null,
    "metadata": {},
    "name": "aggregationsQuery",
    "operationKind": "query",
    "text": "query aggregationsQuery(\n  $form: AggregationForm!\n) {\n  aggregations(form: $form) {\n    __typename\n    ... on Aggregation {\n      __isAggregation: __typename\n      path\n      count\n      exists\n    }\n    ... on BooleanAggregation {\n      false\n      true\n    }\n    ... on IntAggregation {\n      max\n      min\n    }\n    ... on FloatAggregation {\n      inf\n      max\n      min\n      nan\n      ninf\n    }\n    ... on RootAggregation {\n      slice\n      expandedFieldCount\n      frameLabelFieldCount\n    }\n    ... on StringAggregation {\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "e8a94130200106bfc8e3c6b02b19ee7c";

export default node;
