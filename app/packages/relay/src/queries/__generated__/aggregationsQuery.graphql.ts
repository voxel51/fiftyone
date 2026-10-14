/**
 * @generated SignedSource<<c7708a0f689c209f0c8ebe59bb70133a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type AggregationForm = {
  dataset: string;
  dynamicGroup?: object | null;
  eventOffset: number;
  eventSearch?: string | null;
  extendedStages: Array;
  filters?: object | null;
  groupId?: string | null;
  hiddenLabels: ReadonlyArray<SelectedLabel>;
  hint?: string | null;
  index?: number | null;
  maxQueryTime?: number | null;
  mixed: boolean;
  paths: ReadonlyArray<string>;
  queryPerformance?: boolean | null;
  sampleIds: ReadonlyArray<string>;
  slice?: string | null;
  slices?: ReadonlyArray<string> | null;
  view: Array;
  viewName?: string | null;
};
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null;
  instanceId?: string | null;
  labelId: string;
  sampleId: string;
  type?: string | null;
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
    readonly __typename: "EventAggregation";
    readonly count: number;
    readonly events: ReadonlyArray<{
      readonly count: number;
      readonly id: string;
      readonly label: string;
      readonly name: string;
      readonly projection: string;
    }>;
    readonly exists: number;
    readonly path: string;
    readonly total: number;
  } | {
    readonly __typename: "FloatAggregation";
    readonly count: number;
    readonly exists: number;
    readonly inf: number;
    readonly max: number | null;
    readonly min: number | null;
    readonly nan: number;
    readonly ninf: number;
    readonly path: string;
  } | {
    readonly __typename: "IntAggregation";
    readonly count: number;
    readonly exists: number;
    readonly max: number | null;
    readonly min: number | null;
    readonly path: string;
  } | {
    readonly __typename: "RootAggregation";
    readonly count: number;
    readonly exists: number;
    readonly expandedFieldCount: number;
    readonly frameLabelFieldCount: number | null;
    readonly path: string;
    readonly slice: number | null;
  } | {
    readonly __typename: "StringAggregation";
    readonly count: number;
    readonly exists: number;
    readonly path: string;
    readonly values: ReadonlyArray<{
      readonly count: number;
      readonly value: string;
    }> | null;
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
          (v1/*: any*/),
          (v2/*: any*/),
          (v3/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "total",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "EventFacetValue",
            "kind": "LinkedField",
            "name": "events",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "projection",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "id",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "name",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "label",
                "storageKey": null
              },
              (v2/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "type": "EventAggregation",
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
          (v1/*: any*/),
          (v2/*: any*/),
          (v3/*: any*/),
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
          (v1/*: any*/),
          (v2/*: any*/)
        ],
        "type": "DataAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*: any*/),
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/),
          (v5/*: any*/)
        ],
        "type": "IntAggregation",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          (v1/*: any*/),
          (v2/*: any*/),
          (v3/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "inf",
            "storageKey": null
          },
          (v4/*: any*/),
          (v5/*: any*/),
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
          (v1/*: any*/),
          (v2/*: any*/),
          (v3/*: any*/),
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
          (v1/*: any*/),
          (v2/*: any*/),
          (v3/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "StringAggregationValue",
            "kind": "LinkedField",
            "name": "values",
            "plural": true,
            "selections": [
              (v2/*: any*/),
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
    "selections": (v6/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "aggregationsQuery",
    "selections": (v6/*: any*/)
  },
  "params": {
    "cacheID": "4fe4b1521a06a1abe5e8070f5b46cf76",
    "id": null,
    "metadata": {},
    "name": "aggregationsQuery",
    "operationKind": "query",
    "text": "query aggregationsQuery(\n  $form: AggregationForm!\n) {\n  aggregations(form: $form) {\n    __typename\n    ... on EventAggregation {\n      path\n      count\n      exists\n      total\n      events {\n        projection\n        id\n        name\n        label\n        count\n      }\n    }\n    ... on AggregationQueryTimeout {\n      path\n      queryTime\n    }\n    ... on BooleanAggregation {\n      path\n      count\n      exists\n      false\n      true\n    }\n    ... on DataAggregation {\n      path\n      count\n    }\n    ... on IntAggregation {\n      path\n      count\n      exists\n      max\n      min\n    }\n    ... on FloatAggregation {\n      path\n      count\n      exists\n      inf\n      max\n      min\n      nan\n      ninf\n    }\n    ... on RootAggregation {\n      path\n      count\n      exists\n      slice\n      expandedFieldCount\n      frameLabelFieldCount\n    }\n    ... on StringAggregation {\n      path\n      count\n      exists\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f3070da33444e3e9250403bc5bd58a62";

export default node;
