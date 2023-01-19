/**
 * @generated SignedSource<<a1523cc0d8df5d37476380aef857dc57>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetSavedViewsFragmentQuery$variables = {
  name: string;
};
export type DatasetSavedViewsFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"DatasetSavedViewsFragment">;
};
export type DatasetSavedViewsFragmentQuery = {
  response: DatasetSavedViewsFragmentQuery$data;
  variables: DatasetSavedViewsFragmentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "name"
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetSavedViewsFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "DatasetSavedViewsFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetSavedViewsFragmentQuery",
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "datasetName",
            "variableName": "name"
          }
        ],
        "concreteType": "SavedView",
        "kind": "LinkedField",
        "name": "savedViews",
        "plural": true,
        "selections": [
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
            "name": "datasetId",
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
            "name": "slug",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "description",
            "storageKey": null
          },
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
            "name": "viewStages",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "createdAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastLoadedAt",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "f919db0b35ff9c15a0225d3764faf287",
    "id": null,
    "metadata": {},
    "name": "DatasetSavedViewsFragmentQuery",
    "operationKind": "query",
    "text": "query DatasetSavedViewsFragmentQuery(\n  $name: String!\n) {\n  ...DatasetSavedViewsFragment\n}\n\nfragment DatasetSavedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "c7972fa3f5796bad3d7d9766e6ea6d80";

export default node;
