/**
 * @generated SignedSource<<dad518292ff6c6383663eb4d22a27fc8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type groupsEditUserGroupMutation$variables = {
  description?: string | null;
  identifier: string;
  name: string;
};
export type groupsEditUserGroupMutation$data = {
  readonly updateUserGroupInfo: {
    readonly slug: string;
  };
};
export type groupsEditUserGroupMutation = {
  response: groupsEditUserGroupMutation$data;
  variables: groupsEditUserGroupMutation$variables;
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
  "name": "identifier"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v3 = [
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
        "name": "identifier",
        "variableName": "identifier"
      },
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      }
    ],
    "concreteType": "UserGroup",
    "kind": "LinkedField",
    "name": "updateUserGroupInfo",
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
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "groupsEditUserGroupMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "groupsEditUserGroupMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "b721ed2f43147dee365dfba07c863e76",
    "id": null,
    "metadata": {},
    "name": "groupsEditUserGroupMutation",
    "operationKind": "mutation",
    "text": "mutation groupsEditUserGroupMutation(\n  $identifier: String!\n  $name: String!\n  $description: String\n) {\n  updateUserGroupInfo(identifier: $identifier, name: $name, description: $description) {\n    slug\n  }\n}\n"
  }
};
})();

(node as any).hash = "a5724c3d1d9fb8b37fe97573a13e58ae";

export default node;
