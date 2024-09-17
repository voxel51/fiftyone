/**
 * @generated SignedSource<<b00dc47bee878657b67fed9bf08cf27d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type groupAddUsersMutation$variables = {
  user_group_identifier: string;
  user_ids: ReadonlyArray<string>;
};
export type groupAddUsersMutation$data = {
  readonly addUserGroupUsers: {
    readonly description: string | null;
    readonly id: string;
    readonly name: string;
    readonly users: ReadonlyArray<{
      readonly " $fragmentSpreads": FragmentRefs<"groupUsersFragment">;
    }>;
  };
};
export type groupAddUsersMutation = {
  response: groupAddUsersMutation$data;
  variables: groupAddUsersMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "user_group_identifier"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "user_ids"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "userGroupIdentifier",
    "variableName": "user_group_identifier"
  },
  {
    "kind": "Variable",
    "name": "userIds",
    "variableName": "user_ids"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "groupAddUsersMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "UserGroup",
        "kind": "LinkedField",
        "name": "addUserGroupUsers",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "users",
            "plural": true,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "groupUsersFragment"
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "groupAddUsersMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "UserGroup",
        "kind": "LinkedField",
        "name": "addUserGroupUsers",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          (v3/*: any*/),
          (v4/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "users",
            "plural": true,
            "selections": [
              (v2/*: any*/),
              (v3/*: any*/),
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
                "name": "picture",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "role",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "762f3633699306a00abaf54cd1beb519",
    "id": null,
    "metadata": {},
    "name": "groupAddUsersMutation",
    "operationKind": "mutation",
    "text": "mutation groupAddUsersMutation(\n  $user_group_identifier: String!\n  $user_ids: [String!]!\n) {\n  addUserGroupUsers(userGroupIdentifier: $user_group_identifier, userIds: $user_ids) {\n    id\n    name\n    description\n    users {\n      ...groupUsersFragment\n    }\n  }\n}\n\nfragment groupUsersFragment on User {\n  id\n  name\n  email\n  picture\n  role\n}\n"
  }
};
})();

(node as any).hash = "8c4c73067eb27395772121d091542b77";

export default node;
