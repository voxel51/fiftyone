/**
 * @generated SignedSource<<0fec9e45e680b8f07f73be168a7caabd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type FieldVisibilityStageInput = {
  cls: string;
  kwargs?: FieldVisibilityStageInputKwargs | null;
};
export type FieldVisibilityStageInputKwargs = {
  allowMissing?: boolean | null;
  fieldNames: ReadonlyArray<string | null>;
};
export type setFieldVisibilityStageMutation$variables = {
  input: FieldVisibilityStageInput;
  session?: string | null;
  subscription: string;
};
export type setFieldVisibilityStageMutation$data = {
  readonly setFieldVisibilityStage: boolean;
};
export type setFieldVisibilityStageMutation = {
  response: setFieldVisibilityStageMutation$data;
  variables: setFieldVisibilityStageMutation$variables;
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
    "name": "setFieldVisibilityStage",
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
    "name": "setFieldVisibilityStageMutation",
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
    "name": "setFieldVisibilityStageMutation",
    "selections": (v3/*: any*/)
  },
  "params": {
    "cacheID": "f614dacd343c124caf5557c937ba6332",
    "id": null,
    "metadata": {},
    "name": "setFieldVisibilityStageMutation",
    "operationKind": "mutation",
    "text": "mutation setFieldVisibilityStageMutation(\n  $subscription: String!\n  $session: String\n  $input: FieldVisibilityStageInput!\n) {\n  setFieldVisibilityStage(subscription: $subscription, session: $session, input: $input)\n}\n"
  }
};
})();

(node as any).hash = "bc8c23e431673fb886c252d76c5eeff9";

export default node;
