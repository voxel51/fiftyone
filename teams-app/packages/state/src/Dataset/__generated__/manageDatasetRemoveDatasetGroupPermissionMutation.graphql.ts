/**
 * @generated SignedSource<<18fa23b956dcc73f19ea6878ac1e1cd8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type manageDatasetRemoveDatasetGroupPermissionMutation$variables = {
  datasetIdentifier: string;
  groupIdentifier: string;
};
export type manageDatasetRemoveDatasetGroupPermissionMutation$data = {
  readonly removeDatasetUserGroupPermission: {
    readonly id: string;
  };
};
export type manageDatasetRemoveDatasetGroupPermissionMutation = {
  response: manageDatasetRemoveDatasetGroupPermissionMutation$data;
  variables: manageDatasetRemoveDatasetGroupPermissionMutation$variables;
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
    "name": "groupIdentifier"
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
        "name": "userGroupIdentifier",
        "variableName": "groupIdentifier"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "removeDatasetUserGroupPermission",
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
    "name": "manageDatasetRemoveDatasetGroupPermissionMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetRemoveDatasetGroupPermissionMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "a5ae96b14bcb380f1463c330e95cd553",
    "id": null,
    "metadata": {},
    "name": "manageDatasetRemoveDatasetGroupPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetRemoveDatasetGroupPermissionMutation(\n  $datasetIdentifier: String!\n  $groupIdentifier: String!\n) {\n  removeDatasetUserGroupPermission(datasetIdentifier: $datasetIdentifier, userGroupIdentifier: $groupIdentifier) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "0661b86e9803de633b8cfad57497d0ac";

export default node;
