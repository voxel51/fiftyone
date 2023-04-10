/**
 * @generated SignedSource<<07303f38b7da48c5904b3a5ed2d04a74>>
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
export type setViewMutation$variables = {
  datasetName: string;
  form: StateForm;
  savedViewSlug?: string | null;
  session?: string | null;
  subscription: string;
  view: Array;
};
export type setViewMutation$data = {
  readonly setView: Array | null;
};
export type setViewMutation = {
  response: setViewMutation$data;
  variables: setViewMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetName"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "form"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "savedViewSlug"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v6 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "datasetName",
        "variableName": "datasetName"
      },
      {
        "kind": "Variable",
        "name": "form",
        "variableName": "form"
      },
      {
        "kind": "Variable",
        "name": "savedViewSlug",
        "variableName": "savedViewSlug"
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
      },
      {
        "kind": "Variable",
        "name": "view",
        "variableName": "view"
      }
    ],
    "kind": "ScalarField",
    "name": "setView",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setViewMutation",
    "selections": (v6/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v4/*: any*/),
      (v3/*: any*/),
      (v5/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setViewMutation",
    "selections": (v6/*: any*/)
  },
  "params": {
    "cacheID": "dae4551716ec284706b937f03957c59c",
    "id": null,
    "metadata": {},
    "name": "setViewMutation",
    "operationKind": "mutation",
    "text": "mutation setViewMutation(\n  $subscription: String!\n  $session: String\n  $view: BSONArray!\n  $savedViewSlug: String\n  $datasetName: String!\n  $form: StateForm!\n) {\n  setView(subscription: $subscription, session: $session, view: $view, savedViewSlug: $savedViewSlug, datasetName: $datasetName, form: $form)\n}\n"
  }
};
})();

(node as any).hash = "ff65ef65f0ac58283871447aee1861fe";

export default node;
