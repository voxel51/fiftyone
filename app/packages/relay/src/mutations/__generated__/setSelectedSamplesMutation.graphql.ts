/**
 * @generated SignedSource<<1e7e6d186e434346f88ee6ac165986c6>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setSelectedSamplesMutation$variables = {
  selectedSamples: object;
  session?: string | null;
  subscription: string;
};
export type setSelectedSamplesMutation$data = {
  readonly setSelectedSamples: boolean;
};
export type setSelectedSamplesMutation = {
  response: setSelectedSamplesMutation$data;
  variables: setSelectedSamplesMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "selectedSamples"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v3 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "selectedSamples",
        "variableName": "selectedSamples"
      },
      {
        "kind": "Variable",
        "name": "session",
        "variableName": "session"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setSelectedSamples",
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
    "name": "setSelectedSamplesMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSelectedSamplesMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "eb5878d6ca5f65be1609847bf407009c",
    "id": null,
    "metadata": {},
    "name": "setSelectedSamplesMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectedSamplesMutation(\n  $subscription: String!\n  $session: String\n  $selectedSamples: JSON!\n) {\n  setSelectedSamples(subscription: $subscription, session: $session, selectedSamples: $selectedSamples)\n}\n"
  }
};
})();

(node as any).hash = "21ffdf0fded834b80c8cd5a5cea3f95c";

export default node;
