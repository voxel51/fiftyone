/**
 * @generated SignedSource<<22059f03130b7bb2c207ce45a4bdc04d>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type setSelectedMutation$variables = {
  selected: ReadonlyArray<string>;
  session?: string | null | undefined;
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
        "name": "selected",
        "variableName": "selected"
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
      (v0/*:: as any*/),
      (v1/*:: as any*/),
      (v2/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSelectedMutation",
    "selections": (v3/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*:: as any*/),
      (v1/*:: as any*/),
      (v0/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "setSelectedMutation",
    "selections": (v3/*:: as any*/)
  },
  "params": {
    "cacheID": "43838c4a41de9188af1c21ef3c4f2d2c",
    "id": null,
    "metadata": {},
    "name": "setSelectedMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectedMutation(\n  $subscription: String!\n  $session: String\n  $selected: [String!]!\n) {\n  setSelected(subscription: $subscription, session: $session, selected: $selected)\n}\n"
  }
};
})();

(node as any).hash = "09818124d098b1f536791da7d9d4a711";

export default node;
