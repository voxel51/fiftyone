/**
 * @generated SignedSource<<0093edc27ae94de0c491348a89fb36c1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type pluginsOperatorSetPermissionMutation$variables = {
  operatorName: string;
  permission?: DatasetPermission | null;
  pluginName: string;
};
export type pluginsOperatorSetPermissionMutation$data = {
  readonly updatePlugin: {
    readonly name: string;
    readonly operators: ReadonlyArray<{
      readonly name: string;
      readonly permission: {
        readonly minimumDatasetPermission: DatasetPermission | null;
      } | null;
    }>;
  };
};
export type pluginsOperatorSetPermissionMutation = {
  response: pluginsOperatorSetPermissionMutation$data;
  variables: pluginsOperatorSetPermissionMutation$variables;
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
  "name": "permission"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pluginName"
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
                "name": "minimumDatasetPermission",
                "variableName": "permission"
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
                "name": "minimumDatasetPermission",
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
    "name": "pluginsOperatorSetPermissionMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "pluginsOperatorSetPermissionMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "50c452a402ddb0a93b70d68c24a4172f",
    "id": null,
    "metadata": {},
    "name": "pluginsOperatorSetPermissionMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsOperatorSetPermissionMutation(\n  $pluginName: String!\n  $operatorName: String!\n  $permission: DatasetPermission\n) {\n  updatePlugin(name: $pluginName, operatorSettings: {name: $operatorName, permission: {minimumDatasetPermission: $permission}}) {\n    name\n    operators {\n      name\n      permission {\n        minimumDatasetPermission\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "bfaa9ca1c90cf7e2ea2596c31f9288ae";

export default node;
