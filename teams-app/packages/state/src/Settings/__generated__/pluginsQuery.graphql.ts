/**
 * @generated SignedSource<<8af11bd6505087f83be1fa43735f8e8f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type pluginsQuery$variables = {};
export type pluginsQuery$data = {
  readonly plugins: ReadonlyArray<{
    readonly description: string | null;
    readonly enabled: boolean;
    readonly fiftyoneVersion: string | null;
    readonly modifiedAt: string | null;
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
  }>;
};
export type pluginsQuery = {
  response: pluginsQuery$data;
  variables: pluginsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "enabled",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v2 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Plugin",
    "kind": "LinkedField",
    "name": "plugins",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      },
      (v0/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "fiftyoneVersion",
        "storageKey": null
      },
      (v1/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "version",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "modifiedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "PluginOperator",
        "kind": "LinkedField",
        "name": "operators",
        "plural": true,
        "selections": [
          (v0/*: any*/),
          (v1/*: any*/),
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
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "pluginsQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "pluginsQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "cadaadbf4965b0f649d683c7845fc6a7",
    "id": null,
    "metadata": {},
    "name": "pluginsQuery",
    "operationKind": "query",
    "text": "query pluginsQuery {\n  plugins {\n    description\n    enabled\n    fiftyoneVersion\n    name\n    version\n    modifiedAt\n    operators {\n      enabled\n      name\n      permission {\n        minimumDatasetPermission\n        minimumRole\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "03f74f08293b8d81684521f6bcc811f3";

export default node;
