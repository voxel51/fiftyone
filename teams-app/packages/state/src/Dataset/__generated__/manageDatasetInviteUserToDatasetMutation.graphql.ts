/**
 * @generated SignedSource<<91259ac669bbc00f2073b34f7221da89>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type manageDatasetInviteUserToDatasetMutation$variables = {
  datasetIdentifier: string;
  email: any;
  permission: DatasetPermission;
  role?: UserRole | null;
};
export type manageDatasetInviteUserToDatasetMutation$data = {
  readonly setDatasetUserPermission: {
    readonly id: string;
  };
};
export type manageDatasetInviteUserToDatasetMutation = {
  response: manageDatasetInviteUserToDatasetMutation$data;
  variables: manageDatasetInviteUserToDatasetMutation$variables;
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
    "name": "email"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "permission"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "role"
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
        "name": "email",
        "variableName": "email"
      },
      {
        "kind": "Variable",
        "name": "permission",
        "variableName": "permission"
      },
      {
        "kind": "Variable",
        "name": "role",
        "variableName": "role"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "setDatasetUserPermission",
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
    "name": "manageDatasetInviteUserToDatasetMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetInviteUserToDatasetMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "00d0da2d4c4096756314733089c2951b",
    "id": null,
    "metadata": {},
    "name": "manageDatasetInviteUserToDatasetMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetInviteUserToDatasetMutation(\n  $datasetIdentifier: String!\n  $email: Email!\n  $permission: DatasetPermission!\n  $role: UserRole\n) {\n  setDatasetUserPermission(datasetIdentifier: $datasetIdentifier, email: $email, permission: $permission, role: $role) {\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "efc9b0e8dab348828b402d4976bd94a1";

export default node;
