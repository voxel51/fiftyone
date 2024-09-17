/**
 * @generated SignedSource<<f1ce6f2525761ec4f5a7da0f0bbc3dba>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type groupsEditUserGroupInfoMutation$variables = {
  description?: string | null;
  identifier: string;
  name: string;
};
export type groupsEditUserGroupInfoMutation$data = {
  readonly updateUserGroupInfo: {
    readonly slug: string;
  };
};
export type groupsEditUserGroupInfoMutation = {
  response: groupsEditUserGroupInfoMutation$data;
  variables: groupsEditUserGroupInfoMutation$variables;
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
    "name": "groupsEditUserGroupInfoMutation",
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
    "name": "groupsEditUserGroupInfoMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "54bcefad17ca6b022d4b8a2a8d22ff22",
    "id": null,
    "metadata": {},
    "name": "groupsEditUserGroupInfoMutation",
    "operationKind": "mutation",
    "text": "mutation groupsEditUserGroupInfoMutation(\n  $identifier: String!\n  $name: String!\n  $description: String\n) {\n  updateUserGroupInfo(identifier: $identifier, name: $name, description: $description) {\n    slug\n  }\n}\n"
  }
};
})();

(node as any).hash = "108725878914d833cd34897170bd291e";

export default node;
