/**
 * @generated SignedSource<<9dfb76da934f98b875fe83d69426140a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setSelectedMutation$variables = {
  selected: ReadonlyArray<string>;
  selectedMeta?: object | null;
  session?: string | null;
  subscription: string;
};
export type setSelectedMutation$data = {
  readonly setSelected: boolean;
};
export type setSelectedMutation = {
  response: setSelectedMutation$data;
  variables: setSelectedMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "selected"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "selectedMeta"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "selected",
        "variableName": "selected"
      },
      {
        "kind": "Variable",
        "name": "selectedMeta",
        "variableName": "selectedMeta"
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
    "name": "setSelected",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSelectedMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSelectedMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "a1a47be0cc950e05169e5267f8111ce7",
    "id": null,
    "metadata": {},
    "name": "setSelectedMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectedMutation(\n  $subscription: String!\n  $session: String\n  $selected: [String!]!\n  $selectedMeta: JSON\n) {\n  setSelected(subscription: $subscription, session: $session, selected: $selected, selectedMeta: $selectedMeta)\n}\n"
  }
};
})();

(node as any).hash = "6a900083569563d36e0569bbe75d18ef";

export default node;
