/**
 * @generated SignedSource<<72f2ae09959d4f1afab3859c46b6b058>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type pluginsUpgradeMutation$variables = {
  fileUploadToken: string;
  pluginName: string;
};
export type pluginsUpgradeMutation$data = {
  readonly upgradePlugin: {
    readonly description: string | null;
    readonly enabled: boolean;
    readonly fiftyoneVersion: string | null;
    readonly name: string;
    readonly operators: ReadonlyArray<{
      readonly enabled: boolean;
      readonly name: string;
      readonly permission: {
        readonly minimumDatasetPermission: DatasetPermission | null;
        readonly minimumRole: UserRole | null;
      } | null;
    }>;
    readonly version: string | null;
  };
};
export type pluginsUpgradeMutation = {
  response: pluginsUpgradeMutation$data;
  variables: pluginsUpgradeMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "fileUploadToken"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pluginName"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "enabled",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "fileUploadToken",
        "variableName": "fileUploadToken"
      },
      {
        "kind": "Variable",
        "name": "pluginName",
        "variableName": "pluginName"
      }
    ],
    "concreteType": "Plugin",
    "kind": "LinkedField",
    "name": "upgradePlugin",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      },
      (v1/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "fiftyoneVersion",
        "storageKey": null
      },
      (v2/*: any*/),
      {
        "alias": null,
        "args": null,
        "concreteType": "PluginOperator",
        "kind": "LinkedField",
        "name": "operators",
        "plural": true,
        "selections": [
          (v1/*: any*/),
          (v2/*: any*/),
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
              },
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
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "version",
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
    "name": "pluginsUpgradeMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "pluginsUpgradeMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "7ace4b1ec04e715115aab292a256c873",
    "id": null,
    "metadata": {},
    "name": "pluginsUpgradeMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsUpgradeMutation(\n  $fileUploadToken: String!\n  $pluginName: String!\n) {\n  upgradePlugin(fileUploadToken: $fileUploadToken, pluginName: $pluginName) {\n    description\n    enabled\n    fiftyoneVersion\n    name\n    operators {\n      enabled\n      name\n      permission {\n        minimumDatasetPermission\n        minimumRole\n      }\n    }\n    version\n  }\n}\n"
  }
};
})();

(node as any).hash = "7fd69eb99ef8c2494acc7000f51b4336";

export default node;
