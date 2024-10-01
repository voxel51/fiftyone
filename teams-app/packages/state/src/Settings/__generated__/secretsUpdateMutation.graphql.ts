/**
 * @generated SignedSource<<1282c8874dee651060df6fb6f5bf69a9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type SecretScope = "DATASET" | "GLOBAL" | "PLUGIN" | "USER" | "%future added value";
export type secretsUpdateMutation$variables = {
  description?: string | null;
  key: string;
  metadata?: any | null;
  scope?: SecretScope | null;
};
export type secretsUpdateMutation$data = {
  readonly updateSecret: {
    readonly createdAt: string;
    readonly description: string | null;
    readonly secretKey: string;
  };
};
export type secretsUpdateMutation = {
  response: secretsUpdateMutation$data;
  variables: secretsUpdateMutation$variables;
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
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "scope"
},
v4 = [
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
      }
    ],
    "concreteType": "EncryptedSecret",
    "kind": "LinkedField",
    "name": "updateSecret",
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
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "secretsUpdateMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "secretsUpdateMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "edd31ce86084e0561dcffdd9538ec173",
    "id": null,
    "metadata": {},
    "name": "secretsUpdateMutation",
    "operationKind": "mutation",
    "text": "mutation secretsUpdateMutation(\n  $key: String!\n  $description: String\n  $scope: SecretScope\n  $metadata: JSON\n) {\n  updateSecret(key: $key, description: $description, scope: $scope, metadata: $metadata) {\n    secretKey: key\n    createdAt\n    description\n  }\n}\n"
  }
};
})();

(node as any).hash = "631ea2b6d59fee950b04764c9a25aa5b";

export default node;
