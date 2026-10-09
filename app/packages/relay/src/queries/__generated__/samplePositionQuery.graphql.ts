/**
 * @generated SignedSource<<198d26b5e293db4188c723e85f91973e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrderUnit = "DYNAMIC_GROUP" | "GROUP" | "SAMPLE" | "%future added value";
export type OrderInput = {
  dataset: string;
  desc?: boolean | null;
  dynamicGroup?: object | null;
  extendedStages?: object | null;
  filters?: object | null;
  groupSlice?: string | null;
  partition?: ReadonlyArray<PartitionKey> | null;
  sortBy?: string | null;
  unit?: OrderUnit | null;
  view: Array;
};
export type PartitionKey = {
  path: string;
  value?: object | null;
};
export type samplePositionQuery$variables = {
  groupId?: string | null;
  input: OrderInput;
  sampleId?: string | null;
};
export type samplePositionQuery$data = {
  readonly samplePosition: {
    readonly offset: {
      readonly __typename: "SamplePositionValue";
      readonly value: number;
    } | {
      // This will never be '%other', but we need some
      // value in case none of the concrete values match.
      readonly __typename: "%other";
    } | null;
    readonly total: {
      readonly __typename: "SamplePositionValue";
      readonly value: number;
    } | {
      // This will never be '%other', but we need some
      // value in case none of the concrete values match.
      readonly __typename: "%other";
    };
  };
};
export type samplePositionQuery = {
  response: samplePositionQuery$data;
  variables: samplePositionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "groupId"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "input"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sampleId"
},
v3 = [
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
        "name": "value",
        "storageKey": null
      }
    ],
    "type": "SamplePositionValue",
    "abstractKey": null
  }
],
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "groupId",
        "variableName": "groupId"
      },
      {
        "kind": "Variable",
        "name": "input",
        "variableName": "input"
      },
      {
        "kind": "Variable",
        "name": "sampleId",
        "variableName": "sampleId"
      }
    ],
    "concreteType": "SamplePosition",
    "kind": "LinkedField",
    "name": "samplePosition",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": null,
        "kind": "LinkedField",
        "name": "offset",
        "plural": false,
        "selections": (v3/*: any*/),
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": null,
        "kind": "LinkedField",
        "name": "total",
        "plural": false,
        "selections": (v3/*: any*/),
        "storageKey": null
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
    "name": "samplePositionQuery",
    "selections": (v4/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "samplePositionQuery",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "cf930e1922488f89b526b75960ab3e4b",
    "id": null,
    "metadata": {},
    "name": "samplePositionQuery",
    "operationKind": "query",
    "text": "query samplePositionQuery(\n  $input: OrderInput!\n  $sampleId: String = null\n  $groupId: String = null\n) {\n  samplePosition(input: $input, sampleId: $sampleId, groupId: $groupId) {\n    offset {\n      __typename\n      ... on SamplePositionValue {\n        value\n      }\n    }\n    total {\n      __typename\n      ... on SamplePositionValue {\n        value\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "d24939ca0456a5b8860da06ec4bf9c57";

export default node;
