/**
 * @generated SignedSource<<fa7dc75c8d931734d8e0ecce8c6c2dc9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type manageDatasetSetDatasetDefaultPermissionMutation$variables = {
  datasetIdentifier: string;
  permission: DatasetPermission;
};
export type manageDatasetSetDatasetDefaultPermissionMutation$data = {
  readonly setDatasetDefaultPermission: {
    readonly defaultPermission: DatasetPermission;
    readonly id: string;
  };
};
export type manageDatasetSetDatasetDefaultPermissionMutation = {
  response: manageDatasetSetDatasetDefaultPermissionMutation$data;
  variables: manageDatasetSetDatasetDefaultPermissionMutation$variables;
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
    "name": "permission"
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
        "name": "permission",
        "variableName": "permission"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "setDatasetDefaultPermission",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultPermission",
        "storageKey": null
      },
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
    "name": "manageDatasetSetDatasetDefaultPermissionMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetSetDatasetDefaultPermissionMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "b8658432f3277225a4f9ccab8a064698",
    "id": null,
    "metadata": {},
    "name": "manageDatasetSetDatasetDefaultPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetSetDatasetDefaultPermissionMutation(\n  $datasetIdentifier: String!\n  $permission: DatasetPermission!\n) {\n  setDatasetDefaultPermission(datasetIdentifier: $datasetIdentifier, permission: $permission) {\n    defaultPermission\n    id\n  }\n}\n"
  }
};
})();

(node as any).hash = "d4fc859693354208a2c25f85a642c6dc";

export default node;
