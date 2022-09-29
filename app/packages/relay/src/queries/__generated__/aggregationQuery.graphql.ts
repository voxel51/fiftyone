/**
 * @generated SignedSource<<bb6c8a0478ea06eb511045f4aaa5cb4e>>
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
  mixed: boolean;
  path: string;
  sampleIds: ReadonlyArray<string>;
  slice?: string | null;
  view: Array;
};
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null;
  labelId: string;
  sampleId: string;
};
export type aggregationQuery$variables = {
  form: AggregationForm;
};
export type aggregationQuery$data = {
  readonly aggregation: {
    readonly count?: number;
    readonly exists?: number;
    readonly false?: number;
    readonly inf?: number;
    readonly max?: number | null;
    readonly min?: number | null;
    readonly nan?: number;
    readonly ninf?: number;
    readonly slice?: number | null;
    readonly true?: number;
    readonly values?: ReadonlyArray<{
      readonly count: number;
      readonly value: string;
    }>;
  };
};
export type aggregationQuery = {
  response: aggregationQuery$data;
  variables: aggregationQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "form"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "form",
    "variableName": "form"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "count",
  "storageKey": null
},
v3 = {
  "kind": "InlineFragment",
  "selections": [
    (v2/*: any*/),
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
v4 = {
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
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "max",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "min",
  "storageKey": null
},
v7 = {
  "kind": "InlineFragment",
  "selections": [
    (v5/*: any*/),
    (v6/*: any*/)
  ],
  "type": "IntAggregation",
  "abstractKey": null
},
v8 = {
  "kind": "InlineFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "inf",
      "storageKey": null
    },
    (v5/*: any*/),
    (v6/*: any*/),
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
v9 = {
  "kind": "InlineFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "slice",
      "storageKey": null
    }
  ],
  "type": "RootAggregation",
  "abstractKey": null
},
v10 = {
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
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "aggregationQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "aggregation",
        "plural": false,
        "selections": [
          (v3/*: any*/),
          (v4/*: any*/),
          (v7/*: any*/),
          (v8/*: any*/),
          (v9/*: any*/),
          (v10/*: any*/)
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "aggregationQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "aggregation",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          (v3/*: any*/),
          (v4/*: any*/),
          (v7/*: any*/),
          (v8/*: any*/),
          (v9/*: any*/),
          (v10/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "de492502271466b860b64e1c35f72603",
    "id": null,
    "metadata": {},
    "name": "aggregationQuery",
    "operationKind": "query",
    "text": "query aggregationQuery(\n  $form: AggregationForm!\n) {\n  aggregation(form: $form) {\n    __typename\n    ... on Aggregation {\n      __isAggregation: __typename\n      count\n      exists\n    }\n    ... on BooleanAggregation {\n      false\n      true\n    }\n    ... on IntAggregation {\n      max\n      min\n    }\n    ... on FloatAggregation {\n      inf\n      max\n      min\n      nan\n      ninf\n    }\n    ... on RootAggregation {\n      slice\n    }\n    ... on StringAggregation {\n      values {\n        count\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "707aa29a36ce3f22cdfa2906ddeb826a";

export default node;
