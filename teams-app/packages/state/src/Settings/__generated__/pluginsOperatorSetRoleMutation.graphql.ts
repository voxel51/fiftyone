/**
 * @generated SignedSource<<39c04da336372d217eb20e3c9b2389d8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type pluginsOperatorSetRoleMutation$variables = {
  operatorName: string;
  pluginName: string;
  role?: UserRole | null;
};
export type pluginsOperatorSetRoleMutation$data = {
  readonly updatePlugin: {
    readonly name: string;
    readonly operators: ReadonlyArray<{
      readonly name: string;
      readonly permission: {
        readonly minimumRole: UserRole | null;
      } | null;
    }>;
  };
};
export type pluginsOperatorSetRoleMutation = {
  response: pluginsOperatorSetRoleMutation$data;
  variables: pluginsOperatorSetRoleMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "operatorName"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pluginName"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "role"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "pluginName"
      },
      {
        "fields": [
          {
            "kind": "Variable",
            "name": "name",
            "variableName": "operatorName"
          },
          {
            "fields": [
              {
                "kind": "Variable",
                "name": "minimumRole",
                "variableName": "role"
              }
            ],
            "kind": "ObjectValue",
            "name": "permission"
          }
        ],
        "kind": "ObjectValue",
        "name": "operatorSettings"
      }
    ],
    "concreteType": "Plugin",
    "kind": "LinkedField",
    "name": "updatePlugin",
    "plural": false,
    "selections": [
      (v3/*: any*/),
      {
        "alias": null,
        "args": null,
        "concreteType": "PluginOperator",
        "kind": "LinkedField",
        "name": "operators",
        "plural": true,
        "selections": [
          (v3/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "OperatorPermission",
            "kind": "LinkedField",
            "name": "permission",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "minimumRole",
                "storageKey": null
              }
            ],
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
    "name": "pluginsOperatorSetRoleMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "pluginsOperatorSetRoleMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "5581c4c7028a6a45d7a0df9a94e20312",
    "id": null,
    "metadata": {},
    "name": "pluginsOperatorSetRoleMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsOperatorSetRoleMutation(\n  $pluginName: String!\n  $operatorName: String!\n  $role: UserRole\n) {\n  updatePlugin(name: $pluginName, operatorSettings: {name: $operatorName, permission: {minimumRole: $role}}) {\n    name\n    operators {\n      name\n      permission {\n        minimumRole\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "9377e2f73ee2dbb3b6f294d22417c73f";

export default node;
