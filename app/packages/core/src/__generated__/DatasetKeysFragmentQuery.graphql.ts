/**
 * @generated SignedSource<<6cb311b2f8ffb2c502bbc158f81999c5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetKeysFragmentQuery$variables = {
  nameOrSlug: string;
};
export type DatasetKeysFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"DatasetKeysFragment">;
};
export type DatasetKeysFragmentQuery = {
  response: DatasetKeysFragmentQuery$data;
  variables: DatasetKeysFragmentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "nameOrSlug"
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetKeysFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "DatasetKeysFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetKeysFragmentQuery",
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "nameOrSlug",
            "variableName": "nameOrSlug"
          }
        ],
        "concreteType": "DatasetKeys",
        "kind": "LinkedField",
        "name": "getDatasetKeys",
        "plural": false,
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
            "name": "name",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "slug",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "234efbcef6303aa345331b99660ec841",
    "id": null,
    "metadata": {},
    "name": "DatasetKeysFragmentQuery",
    "operationKind": "query",
    "text": "query DatasetKeysFragmentQuery(\n  $nameOrSlug: String!\n) {\n  ...DatasetKeysFragment\n}\n\nfragment DatasetKeysFragment on Query {\n  getDatasetKeys(nameOrSlug: $nameOrSlug) {\n    id\n    name\n    slug\n  }\n}\n"
  }
};
})();

(node as any).hash = "20d4d9447d9aa090078287e2ac788728";

export default node;
