/**
 * @generated SignedSource<<98c1a33fe51f8606ab4b7b2a96e6c28a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type manageDatasetRemoveDatasetUserPermissionMutation$variables = {
  datasetIdentifier: string;
  userId: string;
};
export type manageDatasetRemoveDatasetUserPermissionMutation$data = {
  readonly removeDatasetUserPermission: {
    readonly id: string;
  };
};
export type manageDatasetRemoveDatasetUserPermissionMutation = {
  response: manageDatasetRemoveDatasetUserPermissionMutation$data;
  variables: manageDatasetRemoveDatasetUserPermissionMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "datasetIdentifier"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "userId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "datasetIdentifier",
        "variableName": "datasetIdentifier"
      },
      {
        "kind": "Variable",
        "name": "userId",
        "variableName": "userId"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "removeDatasetUserPermission",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "manageDatasetRemoveDatasetUserPermissionMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetRemoveDatasetUserPermissionMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "5993a8bc9b86e1b548aef59cc1e91364",
    "id": null,
    "metadata": {},
    "name": "manageDatasetRemoveDatasetUserPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetRemoveDatasetUserPermissionMutation(\n  $datasetIdentifier: String!\n  $userId: String!\n) {\n  removeDatasetUserPermission(datasetIdentifier: $datasetIdentifier, userId: $userId) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "f8dd235fbb7a60983ed559497fa2b858";

export default node;
