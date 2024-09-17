/**
 * @generated SignedSource<<e92535a053fecc426df4d7ec76f76df2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RecentViewsListFragmentQuery$variables = {
  firstViews?: number | null;
};
export type RecentViewsListFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"RecentViewsListFragment">;
};
export type RecentViewsListFragmentQuery = {
  response: RecentViewsListFragmentQuery$data;
  variables: RecentViewsListFragmentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "firstViews"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "RecentViewsListFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "RecentViewsListFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "RecentViewsListFragmentQuery",
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "first",
            "variableName": "firstViews"
          }
        ],
        "concreteType": "DatasetViewUser",
        "kind": "LinkedField",
        "name": "userViews",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetView",
            "kind": "LinkedField",
            "name": "view",
            "plural": false,
            "selections": [
              (v1/*: any*/),
              (v2/*: any*/),
              (v3/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "color",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "createdAt",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastLoadedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "loadCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "dataset",
            "plural": false,
            "selections": [
              (v1/*: any*/),
              (v2/*: any*/),
              (v3/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "c4c37be7ee3bcdc9b4caba6910a6ee12",
    "id": null,
    "metadata": {},
    "name": "RecentViewsListFragmentQuery",
    "operationKind": "query",
    "text": "query RecentViewsListFragmentQuery(\n  $firstViews: Int\n) {\n  ...RecentViewsListFragment\n}\n\nfragment RecentViewsListFragment on Query {\n  userViews(first: $firstViews) {\n    view {\n      id\n      name\n      slug\n      color\n      createdAt\n    }\n    lastLoadedAt\n    loadCount\n    dataset {\n      id\n      name\n      slug\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "b6bf2bedff96c8fea1b7948ddae3884b";

export default node;
