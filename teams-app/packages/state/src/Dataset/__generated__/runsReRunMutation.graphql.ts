/**
 * @generated SignedSource<<cf97191618df3d19b9f95a3694aa1801>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type runsReRunMutation$variables = {
  operationId: string;
};
export type runsReRunMutation$data = {
  readonly rerunDelegatedOperation: {
    readonly completedAt: string | null;
    readonly context: any | null;
    readonly datasetId: string | null;
    readonly failedAt: string | null;
    readonly id: string;
    readonly label: string | null;
    readonly operator: string;
    readonly pinned: boolean | null;
    readonly queuedAt: string | null;
    readonly result: any | null;
    readonly runBy: {
      readonly name: string;
    } | null;
    readonly runState: string;
    readonly scheduledAt: string | null;
    readonly startedAt: string | null;
    readonly updatedAt: string | null;
  };
};
export type runsReRunMutation = {
  response: runsReRunMutation$data;
  variables: runsReRunMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "operationId"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "operationId",
        "variableName": "operationId"
      }
    ],
    "concreteType": "DelegatedOperation",
    "kind": "LinkedField",
    "name": "rerunDelegatedOperation",
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
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
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
          }
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
        "name": "scheduledAt",
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
        "name": "updatedAt",
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
    "name": "runsReRunMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsReRunMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "4fe6884b4b30f083cbf189f848d9af48",
    "id": null,
    "metadata": {},
    "name": "runsReRunMutation",
    "operationKind": "mutation",
    "text": "mutation runsReRunMutation(\n  $operationId: String!\n) {\n  rerunDelegatedOperation(operationId: $operationId) {\n    completedAt\n    context\n    datasetId\n    failedAt\n    id\n    operator\n    label\n    pinned\n    queuedAt\n    result\n    runBy {\n      name\n    }\n    runState\n    scheduledAt\n    startedAt\n    updatedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "6144b9ab619ccef2e286d47137d2092f";

export default node;
