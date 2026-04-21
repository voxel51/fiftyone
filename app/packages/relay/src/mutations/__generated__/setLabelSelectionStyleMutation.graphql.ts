/**
 * @generated SignedSource<<31187d4b2d41ee28f6c6910288477900>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setLabelSelectionStyleMutation$variables = {
  session?: string | null;
  style: object;
  subscription: string;
};
export type setLabelSelectionStyleMutation$data = {
  readonly setLabelSelectionStyle: boolean;
};
export type setLabelSelectionStyleMutation = {
  response: setLabelSelectionStyleMutation$data;
  variables: setLabelSelectionStyleMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "style"
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
        "name": "session",
        "variableName": "session"
      },
      {
        "kind": "Variable",
        "name": "style",
        "variableName": "style"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setLabelSelectionStyle",
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
    "name": "setLabelSelectionStyleMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setLabelSelectionStyleMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "a5266141a097f7e07237cd4bdb25947d",
    "id": null,
    "metadata": {},
    "name": "setLabelSelectionStyleMutation",
    "operationKind": "mutation",
    "text": "mutation setLabelSelectionStyleMutation(\n  $subscription: String!\n  $session: String\n  $style: JSON!\n) {\n  setLabelSelectionStyle(subscription: $subscription, session: $session, style: $style)\n}\n"
  }
};
})();

(node as any).hash = "0af10f28cba0b8fdc44b6db5e83919fa";

export default node;
