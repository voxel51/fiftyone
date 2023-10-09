/**
 * @generated SignedSource<<0251fb92ac6c3f393c2bf3f342e705f1>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type FieldVisibilityInput = {
  excludedFields: ReadonlyArray<string | null>;
  selectedFields: ReadonlyArray<string | null>;
};
export type setFieldVisibilityMutation$variables = {
  input: FieldVisibilityInput;
  session?: string | null;
  subscription: string;
};
export type setFieldVisibilityMutation$data = {
  readonly setFieldVisibility: boolean;
};
export type setFieldVisibilityMutation = {
  response: setFieldVisibilityMutation$data;
  variables: setFieldVisibilityMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "input"
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
        "name": "input",
        "variableName": "input"
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
    "name": "setFieldVisibility",
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
    "name": "setFieldVisibilityMutation",
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
    "name": "setFieldVisibilityMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "05c8adff7ab5b0b226dba3f58ea101ad",
    "id": null,
    "metadata": {},
    "name": "setFieldVisibilityMutation",
    "operationKind": "mutation",
    "text": "mutation setFieldVisibilityMutation(\n  $subscription: String!\n  $session: String\n  $input: FieldVisibilityInput!\n) {\n  setFieldVisibility(subscription: $subscription, session: $session, input: $input)\n}\n"
  }
};
})();

(node as any).hash = "9f7c5d68a300f4100b2170a9f569094b";

export default node;
