/**
 * @generated SignedSource<<07797825649eb9d51bcb21549c1d18c1>>
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
    readonly userGroup: {
      readonly __typename: "DatasetUserGroup";
      readonly description: string | null;
      readonly id: string;
      readonly name: string;
      readonly permission: DatasetPermission | null;
      readonly slug: string;
    } | null;
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
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
},
v5 = [
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
        "args": [
          {
            "kind": "Variable",
            "name": "identifier",
            "variableName": "id"
          }
        ],
        "concreteType": "DatasetUserGroup",
        "kind": "LinkedField",
        "name": "userGroup",
        "plural": false,
        "selections": [
          (v1/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "__typename",
            "storageKey": null
          },
          (v2/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "permission",
            "storageKey": null
          },
          (v3/*: any*/),
          (v4/*: any*/)
        ],
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
        "name": "defaultPermission",
        "storageKey": null
      },
      (v3/*: any*/),
      (v1/*: any*/),
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
      (v2/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "sampleFieldsCount",
        "storageKey": null
      },
      (v4/*: any*/),
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
    "selections": (v5/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "manageDatasetSetDatasetGroupPermissionMutation",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "7312bd0f7fdb2c9cfca68f92dafe45d0",
    "id": null,
    "metadata": {},
    "name": "manageDatasetSetDatasetGroupPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetSetDatasetGroupPermissionMutation(\n  $datasetIdentifier: String!\n  $id: String!\n  $permission: DatasetPermission!\n) {\n  setDatasetUserGroupPermission(datasetIdentifier: $datasetIdentifier, userGroupIdentifier: $id, permission: $permission) {\n    userGroup(identifier: $id) {\n      id\n      __typename\n      name\n      permission\n      description\n      slug\n    }\n    createdAt\n    defaultPermission\n    description\n    id\n    lastLoadedAt\n    mediaType\n    name\n    sampleFieldsCount\n    slug\n    tags\n  }\n}\n"
  }
};
})();

(node as any).hash = "5ce0f42619e87179879e11f0ea86cb3f";

export default node;
