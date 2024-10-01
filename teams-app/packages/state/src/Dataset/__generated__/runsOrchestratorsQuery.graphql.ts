/**
 * @generated SignedSource<<72cbfd03613f871d55bea00d002405bc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type runsOrchestratorsQuery$variables = {
  page: number;
  pageSize: number;
};
export type runsOrchestratorsQuery$data = {
  readonly orchestratorsPage: {
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly createdAt: string;
      readonly deactivatedAt: string | null;
      readonly description: string;
      readonly orchestratorIdentifier: string;
      readonly updatedAt: string | null;
    }>;
  };
};
export type runsOrchestratorsQuery = {
  response: runsOrchestratorsQuery$data;
  variables: runsOrchestratorsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "page"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pageSize"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "page",
        "variableName": "page"
      },
      {
        "kind": "Variable",
        "name": "pageSize",
        "variableName": "pageSize"
      }
    ],
    "concreteType": "OrchestratorPage",
    "kind": "LinkedField",
    "name": "orchestratorsPage",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "nodeTotal",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "Orchestrator",
        "kind": "LinkedField",
        "name": "nodes",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "createdAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "deactivatedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "orchestratorIdentifier",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "description",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "updatedAt",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "runsOrchestratorsQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsOrchestratorsQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "e7f2cd8936d8f677f8dae19e66427ac3",
    "id": null,
    "metadata": {},
    "name": "runsOrchestratorsQuery",
    "operationKind": "query",
    "text": "query runsOrchestratorsQuery(\n  $page: Int!\n  $pageSize: Int!\n) {\n  orchestratorsPage(page: $page, pageSize: $pageSize) {\n    nodeTotal\n    nodes {\n      createdAt\n      deactivatedAt\n      orchestratorIdentifier\n      description\n      updatedAt\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "50f72f597c6fdf6e7a437ffde8b2d2a6";

export default node;
