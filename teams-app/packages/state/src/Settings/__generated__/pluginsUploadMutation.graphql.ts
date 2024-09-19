/**
 * @generated SignedSource<<e8a1fb741ace4881649f6b7fb096afab>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type pluginsUploadMutation$variables = {
  fileUploadToken: string;
};
export type pluginsUploadMutation$data = {
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
export type pluginsUploadMutation = {
  response: pluginsUploadMutation$data;
  variables: pluginsUploadMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "fileUploadToken"
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
    "name": "pluginsUploadMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "pluginsUploadMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "3bdd133cae5167422767739216beb148",
    "id": null,
    "metadata": {},
    "name": "pluginsUploadMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsUploadMutation(\n  $fileUploadToken: String!\n) {\n  uploadPlugin(fileUploadToken: $fileUploadToken) {\n    description\n    enabled\n    fiftyoneVersion\n    name\n    operators {\n      enabled\n      name\n      permission {\n        minimumDatasetPermission\n        minimumRole\n      }\n    }\n    version\n  }\n}\n"
  }
};
})();

(node as any).hash = "be06b121b5f449f9b95af1b2f1eae92a";

export default node;
