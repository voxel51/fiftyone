/**
 * @generated SignedSource<<bff0a590d9af4e7b49fa9755cca8e4fd>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type AggregationForm = {
  dataset: string;
  dynamicGroup?: object | null | undefined;
  extendedStages: Array;
  filters?: object | null | undefined;
  groupId?: string | null | undefined;
  hiddenLabels: ReadonlyArray<SelectedLabel>;
  hint?: string | null | undefined;
  index?: number | null | undefined;
  maxQueryTime?: number | null | undefined;
  mixed: boolean;
  paths: ReadonlyArray<string>;
  queryPerformance?: boolean | null | undefined;
  sampleIds: ReadonlyArray<string>;
  slice?: string | null | undefined;
  slices?: ReadonlyArray<string> | null | undefined;
  view: Array;
  viewName?: string | null | undefined;
};
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null | undefined;
  instanceId?: string | null | undefined;
  labelId: string;
  sampleId: string;
  type?: string | null | undefined;
};
export type aggregationsQuery$variables = {
  form: AggregationForm;
};
export type aggregationsQuery$data = {
  readonly aggregations: ReadonlyArray<{
    readonly __typename: "AggregationQueryTimeout";
    readonly path: string;
    readonly queryTime: number;
  } | {
    readonly __typename: "BooleanAggregation";
    readonly count: number;
    readonly exists: number;
    readonly false: number;
    readonly path: string;
    readonly true: number;
  } | {
    readonly __typename: "DataAggregation";
    readonly count: number;
    readonly path: string;
  } | {
    readonly __typename: "FloatAggregation";
    readonly count: number;
    readonly exists: number;
    readonly inf: number;
    readonly max: number | null | undefined;
    readonly min: number | null | undefined;
    readonly nan: number;
    readonly ninf: number;
    readonly path: string;
  } | {
    readonly __typename: "IntAggregation";
    readonly count: number;
    readonly exists: number;
    readonly max: number | null | undefined;
    readonly min: number | null | undefined;
    readonly path: string;
  } | {
    readonly __typename: "RootAggregation";
    readonly count: number;
    readonly exists: number;
    readonly expandedFieldCount: number;
    readonly frameLabelFieldCount: number | null | undefined;
    readonly path: string;
    readonly slice: number | null | undefined;
  } | {
    readonly __typename: "StringAggregation";
    readonly count: number;
    readonly exists: number;
    readonly path: string;
    readonly values: ReadonlyArray<{
      readonly count: number;
      readonly value: string;
    }> | null | undefined;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
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
  "name": "path",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "count",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "exists",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "max",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "min",
  "storageKey": null
},
v6 = [
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
          (v1/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "queryTime",
            "storageKey": null
          }
        ],
        "type": "AggregationQueryTimeout",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          (v2/*:: as any*/),
          (v3/*:: as any*/),
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
          (v1/*:: as any*/),
          (v2/*:: as any*/)
        ],
        "type": "DataAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          (v2/*:: as any*/),
          (v3/*:: as any*/),
          (v4/*:: as any*/),
          (v5/*:: as any*/)
        ],
        "type": "IntAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*:: as any*/),
          (v2/*:: as any*/),
          (v3/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "inf",
            "storageKey": null
          },
          (v4/*:: as any*/),
          (v5/*:: as any*/),
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
          (v1/*:: as any*/),
          (v2/*:: as any*/),
          (v3/*:: as any*/),
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
          (v1/*:: as any*/),
          (v2/*:: as any*/),
          (v3/*:: as any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "StringAggregationValue",
            "kind": "LinkedField",
            "name": "values",
            "plural": true,
            "selections": [
              (v2/*:: as any*/),
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
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "aggregationsQuery",
    "selections": (v6/*:: as any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*:: as any*/),
    "kind": "Operation",
    "name": "aggregationsQuery",
    "selections": (v6/*:: as any*/)
  },
  "params": {
    "cacheID": "590742c0e5a6d1e7d4576b3c2412a6e8",
    "id": null,
    "metadata": {},
    "name": "aggregationsQuery",
    "operationKind": "query",
    "text": "query aggregationsQuery(\n  $form: AggregationForm!\n) {\n  aggregations(form: $form) {\n    __typename\n    ... on AggregationQueryTimeout {\n      path\n      queryTime\n    }\n    ... on BooleanAggregation {\n      path\n      count\n      exists\n      false\n      true\n    }\n    ... on DataAggregation {\n      path\n      count\n    }\n    ... on IntAggregation {\n      path\n      count\n      exists\n      max\n      min\n    }\n    ... on FloatAggregation {\n      path\n      count\n      exists\n      inf\n      max\n      min\n      nan\n      ninf\n    }\n    ... on RootAggregation {\n      path\n      count\n      exists\n      slice\n      expandedFieldCount\n      frameLabelFieldCount\n    }\n    ... on StringAggregation {\n      path\n      count\n      exists\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "e610bc0d8dbced3c9a28516320db5457";

export default node;
