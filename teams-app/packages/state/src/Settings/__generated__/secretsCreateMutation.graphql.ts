/**
 * @generated SignedSource<<7b6dc01d5593c539f0ddd477536cd286>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type SecretScope = "DATASET" | "GLOBAL" | "PLUGIN" | "USER" | "%future added value";
export type secretsCreateMutation$variables = {
  description?: string | null;
  key: string;
  metadata?: any | null;
  scope?: SecretScope | null;
  value: string;
};
export type secretsCreateMutation$data = {
  readonly createSecret: {
    readonly createdAt: string;
    readonly description: string | null;
    readonly secretKey: string;
  };
};
export type secretsCreateMutation = {
  response: secretsCreateMutation$data;
  variables: secretsCreateMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "key"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "metadata"
},
v3 = {
  "defaultValue": "GLOBAL",
  "kind": "LocalArgument",
  "name": "scope"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "value"
},
v5 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "description",
        "variableName": "description"
      },
      {
        "kind": "Variable",
        "name": "key",
        "variableName": "key"
      },
      {
        "kind": "Variable",
        "name": "metadata",
        "variableName": "metadata"
      },
      {
        "kind": "Variable",
        "name": "scope",
        "variableName": "scope"
      },
      {
        "kind": "Variable",
        "name": "value",
        "variableName": "value"
      }
    ],
    "concreteType": "EncryptedSecret",
    "kind": "LinkedField",
    "name": "createSecret",
    "plural": false,
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
        "name": "createdAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "secretsCreateMutation",
    "selections": (v5/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v4/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "secretsCreateMutation",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "5fa457ae442af8bdb948c08cfc4327a2",
    "id": null,
    "metadata": {},
    "name": "secretsCreateMutation",
    "operationKind": "mutation",
    "text": "mutation secretsCreateMutation(\n  $key: String!\n  $value: String!\n  $description: String\n  $scope: SecretScope = GLOBAL\n  $metadata: JSON\n) {\n  createSecret(key: $key, value: $value, description: $description, scope: $scope, metadata: $metadata) {\n    secretKey: key\n    createdAt\n    description\n  }\n}\n"
  }
};
})();

(node as any).hash = "e271cebda3859616be47d4e5d601ed8e";

export default node;
