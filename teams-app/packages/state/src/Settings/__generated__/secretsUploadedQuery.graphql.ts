/**
 * @generated SignedSource<<f616592299bc0d347b8eef5787562a0e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type secretsUploadedQuery$variables = {};
export type secretsUploadedQuery$data = {
  readonly secrets: ReadonlyArray<{
    readonly createdAt: string;
    readonly description: string | null;
    readonly secretKey: string;
  }> | null;
};
export type secretsUploadedQuery = {
  response: secretsUploadedQuery$data;
  variables: secretsUploadedQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "EncryptedSecret",
    "kind": "LinkedField",
    "name": "secrets",
    "plural": true,
    "selections": [
      {
        "alias": "secretKey",
        "args": null,
        "kind": "ScalarField",
        "name": "key",
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
        "name": "createdAt",
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
    "name": "secretsUploadedQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "secretsUploadedQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "68a9a9168faee25b008028a2ae06ed2f",
    "id": null,
    "metadata": {},
    "name": "secretsUploadedQuery",
    "operationKind": "query",
    "text": "query secretsUploadedQuery {\n  secrets {\n    secretKey: key\n    description\n    createdAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "e092078f9d4da39224babc8f4d32d86f";

export default node;
