/**
 * @generated SignedSource<<718484bc881c287b9886f6f0d9e21bf3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setVisiblePathsMutation$variables = {
  session?: string | null;
  subscription: string;
  visiblePaths?: ReadonlyArray<string> | null;
};
export type setVisiblePathsMutation$data = {
  readonly setVisiblePaths: boolean;
};
export type setVisiblePathsMutation = {
  response: setVisiblePathsMutation$data;
  variables: setVisiblePathsMutation$variables;
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
  "name": "subscription"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "visiblePaths"
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
        "name": "subscription",
        "variableName": "subscription"
      },
      {
        "kind": "Variable",
        "name": "visiblePaths",
        "variableName": "visiblePaths"
      }
    ],
    "kind": "ScalarField",
    "name": "setVisiblePaths",
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
    "name": "setVisiblePathsMutation",
    "selections": (v3/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "setVisiblePathsMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "66253b553178d54809c97a0f2bd3ef18",
    "id": null,
    "metadata": {},
    "name": "setVisiblePathsMutation",
    "operationKind": "mutation",
    "text": "mutation setVisiblePathsMutation(\n  $subscription: String!\n  $session: String\n  $visiblePaths: [String!]\n) {\n  setVisiblePaths(subscription: $subscription, session: $session, visiblePaths: $visiblePaths)\n}\n"
  }
};
})();

(node as any).hash = "adb2113896f7465e581b95e82ad9d96e";

export default node;
