/**
 * @generated SignedSource<<dce28cb4a49cf1dacb49183d7ada17be>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type srcExampleQuery$variables = {};
export type srcExampleQuery$data = {
  readonly viewer: {
    readonly id: string;
  } | null;
};
export type srcExampleQuery = {
  response: srcExampleQuery$data;
  variables: srcExampleQuery$variables;
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
    "name": "srcExampleQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "srcExampleQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "8bd8055d000511b87673b1076035c51c",
    "id": null,
    "metadata": {},
    "name": "srcExampleQuery",
    "operationKind": "query",
    "text": "query srcExampleQuery {\n  viewer {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "0d9c0b9b7c3e966ef315316e6bb9af52";

export default node;
