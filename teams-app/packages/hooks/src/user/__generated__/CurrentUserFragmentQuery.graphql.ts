/**
 * @generated SignedSource<<3893ad4d366e5e8b266a941a8389911f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type CurrentUserFragmentQuery$variables = {};
export type CurrentUserFragmentQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"CurrentUserFragment">;
};
export type CurrentUserFragmentQuery = {
  response: CurrentUserFragmentQuery$data;
  variables: CurrentUserFragmentQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "CurrentUserFragmentQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "CurrentUserFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "CurrentUserFragmentQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "viewer",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "APIKey",
            "kind": "LinkedField",
            "name": "apiKeys",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "createdAt",
                "storageKey": null
              },
              (v0/*: any*/),
              (v1/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "picture",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "role",
            "storageKey": null
          },
          (v1/*: any*/),
          (v0/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "email",
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "04b23ee173ddf4e9a3e177676949e94b",
    "id": null,
    "metadata": {},
    "name": "CurrentUserFragmentQuery",
    "operationKind": "query",
    "text": "query CurrentUserFragmentQuery {\n  ...CurrentUserFragment\n}\n\nfragment CurrentUserFragment on Query {\n  viewer {\n    apiKeys {\n      createdAt\n      id\n      name\n    }\n    picture\n    role\n    name\n    id\n    email\n  }\n}\n"
  }
};
})();

(node as any).hash = "da062923630ec3b7c9d2c543ac245219";

export default node;
