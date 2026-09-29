/**
 * @generated SignedSource<<f1c350183c4134f1cc694ed843c5f0f7>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type SelectedLabel = {
  field: string;
  frameNumber?: number | null | undefined;
  instanceId?: string | null | undefined;
  labelId: string;
  sampleId: string;
  type?: string | null | undefined;
};
export type setSelectedLabelsMutation$variables = {
  selectedLabels: ReadonlyArray<SelectedLabel>;
  session?: string | null | undefined;
  subscription: string;
};
export type setSelectedLabelsMutation$data = {
  readonly setSelectedLabels: boolean;
};
export type setSelectedLabelsMutation = {
  response: setSelectedLabelsMutation$data;
  variables: setSelectedLabelsMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "selectedLabels"
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
        "name": "selectedLabels",
        "variableName": "selectedLabels"
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
    "name": "setSelectedLabels",
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
    "name": "setSelectedLabelsMutation",
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
    "name": "setSelectedLabelsMutation",
    "selections": (v3/*:: as any*/)
  },
  "params": {
    "cacheID": "bf598288c8d46b7377f6a78b34cf0126",
    "id": null,
    "metadata": {},
    "name": "setSelectedLabelsMutation",
    "operationKind": "mutation",
    "text": "mutation setSelectedLabelsMutation(\n  $subscription: String!\n  $session: String\n  $selectedLabels: [SelectedLabel!]!\n) {\n  setSelectedLabels(subscription: $subscription, session: $session, selectedLabels: $selectedLabels)\n}\n"
  }
};
})();

(node as any).hash = "fae0cda0b0e2376ff1e9c65cc3c9e03f";

export default node;
