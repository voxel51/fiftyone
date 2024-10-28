/**
 * @generated SignedSource<<a1530370f1d3fe8e0b84d69f34d2b917>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type manageDatasetSetDatasetUserPermissionMutation$variables = {
  datasetIdentifier: string;
  permission: DatasetPermission;
  userId: string;
};
export type manageDatasetSetDatasetUserPermissionMutation$data = {
  readonly setDatasetUserPermission: {
    readonly user: {
      readonly activePermission: DatasetPermission;
      readonly user: {
        readonly email: string;
        readonly id: string;
        readonly name: string;
        readonly picture: string | null;
        readonly role: UserRole;
      };
      readonly userPermission: DatasetPermission | null;
    } | null;
  };
};
export type manageDatasetSetDatasetUserPermissionMutation = {
  response: manageDatasetSetDatasetUserPermissionMutation$data;
  variables: manageDatasetSetDatasetUserPermissionMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetIdentifier"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "permission"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "userId"
},
v3 = [
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
        "name": "userId",
        "variableName": "userId"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "setDatasetUserPermission",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "id",
            "variableName": "userId"
          }
        ],
        "concreteType": "DatasetUser",
        "kind": "LinkedField",
        "name": "user",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "user",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "email",
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
                "name": "name",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "role",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "picture",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "userPermission",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "activePermission",
            "storageKey": null
          }
        ],
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
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "manageDatasetSetDatasetUserPermissionMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "manageDatasetSetDatasetUserPermissionMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "0b64fb4f82c292951585b275a3db81c4",
    "id": null,
    "metadata": {},
    "name": "manageDatasetSetDatasetUserPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation manageDatasetSetDatasetUserPermissionMutation(\n  $datasetIdentifier: String!\n  $userId: String!\n  $permission: DatasetPermission!\n) {\n  setDatasetUserPermission(datasetIdentifier: $datasetIdentifier, userId: $userId, permission: $permission) {\n    user(id: $userId) {\n      user {\n        email\n        id\n        name\n        role\n        picture\n      }\n      userPermission\n      activePermission\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "f416b009c4b2e82ba7688e9b798a3129";

export default node;
