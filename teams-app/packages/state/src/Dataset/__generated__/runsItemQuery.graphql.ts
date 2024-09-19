/**
 * @generated SignedSource<<3c80f55fbf346b37839dad46cbc2eaaf>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type runsItemQuery$variables = {
  run: string;
};
export type runsItemQuery$data = {
  readonly delegatedOperation: {
    readonly completedAt: string | null;
    readonly context: any | null;
    readonly datasetId: string | null;
    readonly failedAt: string | null;
    readonly id: string;
    readonly label: string | null;
    readonly metadata: any | null;
    readonly operator: string;
    readonly pinned: boolean | null;
    readonly queuedAt: string;
    readonly result: any | null;
    readonly runBy: {
      readonly id: string;
      readonly name: string;
    } | null;
    readonly runLink: string | null;
    readonly runState: string;
    readonly startedAt: string | null;
    readonly status: any | null;
  };
};
export type runsItemQuery = {
  response: runsItemQuery$data;
  variables: runsItemQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "run"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "operationId",
        "variableName": "run"
      }
    ],
    "concreteType": "DelegatedOperation",
    "kind": "LinkedField",
    "name": "delegatedOperation",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "completedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "context",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "datasetId",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "failedAt",
        "storageKey": null
      },
      (v1/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "operator",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "label",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "pinned",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "queuedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "result",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "runBy",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "name",
            "storageKey": null
          },
          (v1/*: any*/)
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "runState",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "startedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "status",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "runLink",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "metadata",
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
    "name": "runsItemQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsItemQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "521c13ca2c7906f799b7e6e0ae5a5677",
    "id": null,
    "metadata": {},
    "name": "runsItemQuery",
    "operationKind": "query",
    "text": "query runsItemQuery(\n  $run: String!\n) {\n  delegatedOperation(operationId: $run) {\n    completedAt\n    context\n    datasetId\n    failedAt\n    id\n    operator\n    label\n    pinned\n    queuedAt\n    result\n    runBy {\n      name\n      id\n    }\n    runState\n    startedAt\n    status\n    runLink\n    metadata\n  }\n}\n"
  }
};
})();

(node as any).hash = "879e718efe9fb1ccaf52085ea4e87229";

export default node;
