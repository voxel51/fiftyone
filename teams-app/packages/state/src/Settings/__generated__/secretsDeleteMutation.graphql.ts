/**
 * @generated SignedSource<<5e74639597809ddf434459824ca2a0c7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type secretsDeleteMutation$variables = {
  key: string;
};
export type secretsDeleteMutation$data = {
  readonly deleteSecret: any | null;
};
export type secretsDeleteMutation = {
  response: secretsDeleteMutation$data;
  variables: secretsDeleteMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "key"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "key",
        "variableName": "key"
      }
    ],
    "kind": "ScalarField",
    "name": "deleteSecret",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "secretsDeleteMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "secretsDeleteMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "1d46df0cc810514c3885f1cd8f8c8e37",
    "id": null,
    "metadata": {},
    "name": "secretsDeleteMutation",
    "operationKind": "mutation",
    "text": "mutation secretsDeleteMutation(\n  $key: String!\n) {\n  deleteSecret(key: $key)\n}\n"
  }
};
})();

(node as any).hash = "97d82f2e68cd44d9c6d9ad3241d93d2c";

export default node;
