/**
 * @generated SignedSource<<e82d8c6d6b46ee0a9351a5a25a31c379>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "COMMENT" | "EDIT" | "MANAGE" | "NO_ACCESS" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type pluginsCreateMutation$variables = {
  fileUploadToken: string;
  overwrite?: boolean | null;
};
export type pluginsCreateMutation$data = {
  readonly uploadPlugin: {
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
export type pluginsCreateMutation = {
  response: pluginsCreateMutation$data;
  variables: pluginsCreateMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "fileUploadToken"
  },
  {
    "defaultValue": false,
    "kind": "LocalArgument",
    "name": "overwrite"
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
        "name": "overwrite",
        "variableName": "overwrite"
      }
    ],
    "concreteType": "Plugin",
    "kind": "LinkedField",
    "name": "uploadPlugin",
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
    "name": "pluginsCreateMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "pluginsCreateMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "a634625970aa87f2a6b0052c4e04fa3e",
    "id": null,
    "metadata": {},
    "name": "pluginsCreateMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsCreateMutation(\n  $fileUploadToken: String!\n  $overwrite: Boolean = false\n) {\n  uploadPlugin(fileUploadToken: $fileUploadToken, overwrite: $overwrite) {\n    description\n    enabled\n    fiftyoneVersion\n    name\n    operators {\n      enabled\n      name\n      permission {\n        minimumDatasetPermission\n        minimumRole\n      }\n    }\n    version\n  }\n}\n"
  }
};
})();

(node as any).hash = "5cb1414d557b01f278292b6e2e18a6fe";

export default node;
