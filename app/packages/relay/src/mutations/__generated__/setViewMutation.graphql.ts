/**
 * @generated SignedSource<<df75e15b04035f6e2e7053dd81397d0b>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type StateForm = {
  addStages?: Array | null | undefined;
  extended?: object | null | undefined;
  filters?: object | null | undefined;
  labels?: ReadonlyArray<SelectedLabel> | null | undefined;
  sampleIds?: ReadonlyArray<string> | null | undefined;
  slice?: string | null | undefined;
};
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null | undefined;
  instanceId?: string | null | undefined;
  labelId: string;
  sampleId: string;
  type?: string | null | undefined;
};
export type setViewMutation$variables = {
  datasetName: string;
  form: StateForm;
  savedViewSlug?: string | null | undefined;
  session?: string | null | undefined;
  subscription: string;
  view: Array;
};
export type setViewMutation$data = {
  readonly setView: Array | null | undefined;
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
      (v0/*:: as any*/),
      (v1/*:: as any*/),
      (v2/*:: as any*/),
      (v3/*:: as any*/),
      (v4/*:: as any*/),
      (v5/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setViewMutation",
    "selections": (v6/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v4/*:: as any*/),
      (v3/*:: as any*/),
      (v5/*:: as any*/),
      (v2/*:: as any*/),
      (v0/*:: as any*/),
      (v1/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "setViewMutation",
    "selections": (v6/*:: as any*/)
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
