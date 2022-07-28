/**
 * @generated SignedSource<<a14e0bade0e7eb45cd4a095cd8bb2403>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetsPaginationQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  search?: string | null;
};
export type DatasetsPaginationQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"RootDatasets_query">;
};
export type DatasetsPaginationQuery = {
  response: DatasetsPaginationQuery$data;
  variables: DatasetsPaginationQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "count"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "cursor"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "search"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "after",
    "variableName": "cursor"
  },
  {
    "kind": "Variable",
    "name": "first",
    "variableName": "count"
  },
  {
    "kind": "Variable",
    "name": "search",
    "variableName": "search"
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsPaginationQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "RootDatasets_query"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetsPaginationQuery",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "DatasetStrConnection",
        "kind": "LinkedField",
        "name": "datasets",
        "plural": false,
        "selections": [
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
            "concreteType": "DatasetStrEdge",
            "kind": "LinkedField",
            "name": "edges",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "cursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "Dataset",
                "kind": "LinkedField",
                "name": "node",
                "plural": false,
                "selections": [
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
                    "name": "id",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "__typename",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetStrPageInfo",
            "kind": "LinkedField",
            "name": "pageInfo",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "endCursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "hasNextPage",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": (v1/*: any*/),
        "filters": [
          "search"
        ],
        "handle": "connection",
        "key": "DatasetsList_query_datasets",
        "kind": "LinkedHandle",
        "name": "datasets"
      }
    ]
  },
  "params": {
    "cacheID": "1e0b621671e78c21b0947dcfa72dd51e",
    "id": null,
    "metadata": {},
    "name": "DatasetsPaginationQuery",
    "operationKind": "query",
    "text": "query DatasetsPaginationQuery(\n  $count: Int\n  $cursor: String\n  $search: String\n) {\n  ...RootDatasets_query\n}\n\nfragment RootDatasets_query on Query {\n  datasets(search: $search, first: $count, after: $cursor) {\n    total\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "280afc557752c2245a140c58ccb00248";

export default node;
