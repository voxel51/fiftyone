/**
 * @generated SignedSource<<46e201ba41494987c15b5a74abcad1cd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type StateForm = {
  addStages?: Array | null;
  extended?: object | null;
  filters?: object | null;
  labels?: ReadonlyArray<SelectedLabel> | null;
  sampleIds?: ReadonlyArray<string> | null;
  slice?: string | null;
};
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null;
  labelId: string;
  sampleId: string;
};
export type setSelectedFieldsMutation$variables = {
  form?: StateForm | null;
  subscription: string;
};
export type setSelectedFieldsMutation$data = {
  readonly setSelectedFields: boolean;
};
export type setSelectedFieldsMutation = {
  response: setSelectedFieldsMutation$data;
  variables: setSelectedFieldsMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "form"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "form",
        "variableName": "form"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setSelectedFields",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setSelectedFieldsMutation",
    "selections": (v2/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSelectedFieldsMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "9710cbfea815fe32084cc1368e56617f",
    "id": null,
    "metadata": {},
    "name": "setSelectedFieldsMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectedFieldsMutation(\n  $subscription: String!\n  $form: StateForm = null\n) {\n  setSelectedFields(subscription: $subscription, form: $form)\n}\n"
  }
};
})();

(node as any).hash = "cdb66db2bb9248ea3be297c782ab5507";

export default node;
