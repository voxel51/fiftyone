/**
 * @generated SignedSource<<9bc4ff1bd8056f1de245c97f93e0f5f3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, GraphQLSubscription } from 'relay-runtime';
export type tickSubscription$variables = {};
export type tickSubscription$data = {
  readonly tick: number;
};
export type tickSubscription = {
  response: tickSubscription$data;
  variables: tickSubscription$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "tick",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "tickSubscription",
    "selections": (v0/*: any*/),
    "type": "Subscription",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "tickSubscription",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "bb9469cad1c58fd5a69104e6e0fa0ad7",
    "id": null,
    "metadata": {},
    "name": "tickSubscription",
    "operationKind": "subscription",
    "text": "subscription tickSubscription {\n  tick\n}\n"
  }
};
})();

(node as any).hash = "37f5c97f374d6c8a1eba6ce0426e4528";

export default node;
