/**
 * @generated SignedSource<<94839842a5d7ce3d5205e9c39cadbbd9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type srcQuery$variables = {};
export type srcQuery$data = {
  readonly teamsConfig: {
    readonly organization: string;
  };
};
export type srcQuery = {
  variables: srcQuery$variables;
  response: srcQuery$data;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "TeamsConfig",
    "kind": "LinkedField",
    "name": "teamsConfig",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "organization",
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
    "name": "srcQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "srcQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "0a146faaf50b87e73e73b90aca063d7d",
    "id": null,
    "metadata": {},
    "name": "srcQuery",
    "operationKind": "query",
    "text": "query srcQuery {\n  teamsConfig {\n    organization\n  }\n}\n"
  }
};
})();

(node as any).hash = "ffc9a55974ae971c33c10a95ccf79af2";

export default node;
