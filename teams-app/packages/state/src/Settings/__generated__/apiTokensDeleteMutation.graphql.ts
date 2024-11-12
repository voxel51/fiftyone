/**
 * @generated SignedSource<<bf4f2bf08c8eb21ad7284a99377411d8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type apiTokensDeleteMutation$variables = {
  keyId: string;
};
export type apiTokensDeleteMutation$data = {
  readonly removeApiKey: any | null;
};
export type apiTokensDeleteMutation = {
  response: apiTokensDeleteMutation$data;
  variables: apiTokensDeleteMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "keyId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "keyId",
        "variableName": "keyId"
      }
    ],
    "kind": "ScalarField",
    "name": "removeApiKey",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "apiTokensDeleteMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "apiTokensDeleteMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "c64587a925e98d7bcad616c488286946",
    "id": null,
    "metadata": {},
    "name": "apiTokensDeleteMutation",
    "operationKind": "mutation",
    "text": "mutation apiTokensDeleteMutation(\n  $keyId: String!\n) {\n  removeApiKey(keyId: $keyId)\n}\n"
  }
};
})();

(node as any).hash = "fbe18b77e65fd42d4f00a66cea5c7471";

export default node;
