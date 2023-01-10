/**
 * @generated SignedSource<<ec742d2ba9628c64e84c768302b67c81>>
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
    "cacheID": "f5e6dc02b4feb9380ac78f89d8ba0df1",
    "id": null,
    "metadata": {},
    "name": "DatasetSavedViewsFragmentQuery",
    "operationKind": "query",
    "text": "query DatasetSavedViewsFragmentQuery(\n  $name: String!\n) {\n  ...DatasetSavedViewsFragment\n}\n\nfragment DatasetSavedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "a10c384cf9aba742ed54c5eeb463f040";

export default node;
