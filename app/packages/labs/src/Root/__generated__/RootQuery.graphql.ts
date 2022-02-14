/**
 * @generated SignedSource<<f3c55a5f21a00b49bd8f48549e81a1b4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type RootQuery$variables = {};
export type RootQueryVariables = RootQuery$variables;
export type RootQuery$data = {
  readonly viewer: {
    readonly id: string;
  };
};
export type RootQueryResponse = RootQuery$data;
export type RootQuery = {
  variables: RootQueryVariables;
  response: RootQuery$data;
};

const node: ConcreteRequest = (function(){
var v0 = [
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
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "RootQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "RootQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "db32482c9470f2f16ece1a47f9ecaa84",
    "id": null,
    "metadata": {},
    "name": "RootQuery",
    "operationKind": "query",
    "text": "query RootQuery {\n  viewer {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "ceb57eeb39b7e4af16b6afceeb1d9106";

export default node;
