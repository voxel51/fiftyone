/**
 * @generated SignedSource<<33ee2b9b1fba22e1c231d690e4ce8a96>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type MediaTypeOption = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
export type manageDatasetSetDatasetGroupPermissionMutation$variables = {
  datasetIdentifier: string;
  id: string;
  permission: DatasetPermission;
};
export type manageDatasetSetDatasetGroupPermissionMutation$data = {
  readonly setDatasetUserGroupPermission: {
    readonly createdAt: string | null;
    readonly defaultPermission: DatasetPermission;
    readonly description: string | null;
    readonly id: string;
    readonly lastLoadedAt: string | null;
    readonly mediaType: MediaTypeOption | null;
    readonly name: string;
    readonly sampleFieldsCount: number;
    readonly slug: string;
    readonly tags: ReadonlyArray<string>;
  };
};
export type manageDatasetSetDatasetGroupPermissionMutation = {
  response: manageDatasetSetDatasetGroupPermissionMutation$data;
  variables: manageDatasetSetDatasetGroupPermissionMutation$variables;
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
    "name": "id"
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
      },
      {
        "kind": "Variable",
        "name": "userGroupIdentifier",
        "variableName": "id"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "setDatasetUserGroupPermission",
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
        "name": "defaultPermission",
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
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "lastLoadedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "mediaType",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "sampleFieldsCount",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "tags",
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
    "name": "manageDatasetSetDatasetGroupPermissionMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetSetDatasetGroupPermissionMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "b746aeb7b11ecda126da07d616c4a9b8",
    "id": null,
    "metadata": {},
    "name": "manageDatasetSetDatasetGroupPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetSetDatasetGroupPermissionMutation(\n  $datasetIdentifier: String!\n  $id: String!\n  $permission: DatasetPermission!\n) {\n  setDatasetUserGroupPermission(datasetIdentifier: $datasetIdentifier, userGroupIdentifier: $id, permission: $permission) {\n    createdAt\n    defaultPermission\n    description\n    id\n    lastLoadedAt\n    mediaType\n    name\n    sampleFieldsCount\n    slug\n    tags\n  }\n}\n"
  }
};
})();

(node as any).hash = "bd5f12d28d39e111be271221cbf907c0";

export default node;
