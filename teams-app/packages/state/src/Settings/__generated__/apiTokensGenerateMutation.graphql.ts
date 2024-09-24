/**
 * @generated SignedSource<<6491c12693ef300145028c6f7b67c150>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type apiTokensGenerateMutation$variables = {
  name: string;
};
export type apiTokensGenerateMutation$data = {
  readonly generateApiKey: {
    readonly createdAt: string;
    readonly id: string;
    readonly key: string | null;
    readonly name: string;
  };
};
export type apiTokensGenerateMutation = {
  response: apiTokensGenerateMutation$data;
  variables: apiTokensGenerateMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "name"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      }
    ],
    "concreteType": "APIKey",
    "kind": "LinkedField",
    "name": "generateApiKey",
    "plural": false,
    "selections": [
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
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "key",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "apiTokensGenerateMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "apiTokensGenerateMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "a14101168bcab6aa4aea5dcead91f6aa",
    "id": null,
    "metadata": {},
    "name": "apiTokensGenerateMutation",
    "operationKind": "mutation",
    "text": "mutation apiTokensGenerateMutation(\n  $name: String!\n) {\n  generateApiKey(name: $name) {\n    createdAt\n    id\n    key\n    name\n  }\n}\n"
  }
};
})();

(node as any).hash = "c071d350cf0b7bc28817b377759af41f";

export default node;
