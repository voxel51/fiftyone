/**
 * @generated SignedSource<<bbed7bf4e21af6280db01ac6ab0f12e6>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type groupsCreateUserGroupMutation$variables = {
  description?: string | null;
  name: string;
};
export type groupsCreateUserGroupMutation$data = {
  readonly createUserGroup: {
    readonly slug: string;
  };
};
export type groupsCreateUserGroupMutation = {
  response: groupsCreateUserGroupMutation$data;
  variables: groupsCreateUserGroupMutation$variables;
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
  "name": "name"
},
v2 = [
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
        "name": "name",
        "variableName": "name"
      }
    ],
    "concreteType": "UserGroup",
    "kind": "LinkedField",
    "name": "createUserGroup",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
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
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "groupsCreateUserGroupMutation",
    "selections": (v2/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "groupsCreateUserGroupMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "617d2de6aa625d9694c6a4f9888968cc",
    "id": null,
    "metadata": {},
    "name": "groupsCreateUserGroupMutation",
    "operationKind": "mutation",
    "text": "mutation groupsCreateUserGroupMutation(\n  $name: String!\n  $description: String\n) {\n  createUserGroup(name: $name, description: $description) {\n    slug\n  }\n}\n"
  }
};
})();

(node as any).hash = "aec3561c1980d550a59f606feca980cd";

export default node;
