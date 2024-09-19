/**
 * @generated SignedSource<<eb4b2056ea2322980e001c3884975485>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type runsOrchestratorQuery$variables = {
  orchestratorIdentifier: string;
};
export type runsOrchestratorQuery$data = {
  readonly orchestrator: {
    readonly availableOperators: ReadonlyArray<string> | null;
  };
};
export type runsOrchestratorQuery = {
  response: runsOrchestratorQuery$data;
  variables: runsOrchestratorQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "orchestratorIdentifier"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "orchestratorIdentifier",
        "variableName": "orchestratorIdentifier"
      }
    ],
    "concreteType": "Orchestrator",
    "kind": "LinkedField",
    "name": "orchestrator",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "availableOperators",
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
    "name": "runsOrchestratorQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsOrchestratorQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "c745120a4739d67a6618e731de59333f",
    "id": null,
    "metadata": {},
    "name": "runsOrchestratorQuery",
    "operationKind": "query",
    "text": "query runsOrchestratorQuery(\n  $orchestratorIdentifier: String!\n) {\n  orchestrator(orchestratorIdentifier: $orchestratorIdentifier) {\n    availableOperators\n  }\n}\n"
  }
};
})();

(node as any).hash = "bcdda075512d0415b4ee8f2e647b1732";

export default node;
