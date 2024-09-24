/**
 * @generated SignedSource<<ec962a7154f342fbf403fce0048b2fbb>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type groupRemoveUsersMutation$variables = {
  user_group_identifier: string;
  user_ids: ReadonlyArray<string>;
};
export type groupRemoveUsersMutation$data = {
  readonly removeUserGroupUsers: {
    readonly description: string | null;
    readonly id: string;
    readonly name: string;
    readonly users: ReadonlyArray<{
      readonly " $fragmentSpreads": FragmentRefs<"groupUsersFragment">;
    }>;
  };
};
export type groupRemoveUsersMutation = {
  response: groupRemoveUsersMutation$data;
  variables: groupRemoveUsersMutation$variables;
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
    "name": "groupRemoveUsersMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "UserGroup",
        "kind": "LinkedField",
        "name": "removeUserGroupUsers",
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
    "name": "groupRemoveUsersMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": "UserGroup",
        "kind": "LinkedField",
        "name": "removeUserGroupUsers",
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
    "cacheID": "b4e9b24c147b23caca7cad45627e7f0e",
    "id": null,
    "metadata": {},
    "name": "groupRemoveUsersMutation",
    "operationKind": "mutation",
    "text": "mutation groupRemoveUsersMutation(\n  $user_group_identifier: String!\n  $user_ids: [String!]!\n) {\n  removeUserGroupUsers(userGroupIdentifier: $user_group_identifier, userIds: $user_ids) {\n    id\n    name\n    description\n    users {\n      ...groupUsersFragment\n    }\n  }\n}\n\nfragment groupUsersFragment on User {\n  id\n  name\n  email\n  picture\n  role\n}\n"
  }
};
})();

(node as any).hash = "2c4335d34856e554ef75936244bef48e";

export default node;
