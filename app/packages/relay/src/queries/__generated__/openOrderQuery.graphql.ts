/**
 * @generated SignedSource<<41c8e8fb37d5f7c58c85841e953ac0a4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrderMode = "INDEXED" | "SCROLL" | "SMALL" | "%future added value";
export type OrderScale = "DATE" | "ID" | "NUMBER" | "%future added value";
export type OrderUnit = "DYNAMIC_GROUP" | "GROUP" | "SAMPLE" | "%future added value";
export type Unavailable = "BUDGET_EXCEEDED" | "FRAME_SORT" | "UNSUPPORTED_STAGE" | "%future added value";
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
export type openOrderQuery$variables = {
  input: OrderInput;
};
export type openOrderQuery$data = {
  readonly openOrder: {
    readonly __typename: "Order";
    readonly bounds: {
      readonly max: object | null;
      readonly min: object | null;
      readonly scale: OrderScale | null;
    } | null;
    readonly mode: OrderMode;
    readonly ticks: ReadonlyArray<{
      readonly fraction: number;
      readonly label: string;
    }>;
    readonly token: any;
    readonly total: number | null;
  } | {
    readonly __typename: "OrderUnavailable";
    readonly reason: Unavailable;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  };
};
export type openOrderQuery = {
  response: openOrderQuery$data;
  variables: openOrderQuery$variables;
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
    "name": "openOrder",
    "plural": false,
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
            "name": "token",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "mode",
            "storageKey": null
          },
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
            "concreteType": "OrderBounds",
            "kind": "LinkedField",
            "name": "bounds",
            "plural": false,
            "selections": [
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
                "name": "max",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "scale",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "OrderTick",
            "kind": "LinkedField",
            "name": "ticks",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "fraction",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "label",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "type": "Order",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "reason",
            "storageKey": null
          }
        ],
        "type": "OrderUnavailable",
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
    "name": "openOrderQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "openOrderQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "81dfcc15ec93691accbdd2f26dfab64e",
    "id": null,
    "metadata": {},
    "name": "openOrderQuery",
    "operationKind": "query",
    "text": "query openOrderQuery(\n  $input: OrderInput!\n) {\n  openOrder(input: $input) {\n    __typename\n    ... on Order {\n      token\n      mode\n      total\n      bounds {\n        min\n        max\n        scale\n      }\n      ticks {\n        fraction\n        label\n      }\n    }\n    ... on OrderUnavailable {\n      reason\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "c10695b745a79485bff629f5d15bc99b";

export default node;
