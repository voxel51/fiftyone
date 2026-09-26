/**
 * @generated SignedSource<<de636e028cdec691700286da95d96251>>
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
export type createSavedViewMutation$variables = {
  color?: string | null | undefined;
  datasetName?: string | null | undefined;
  description?: string | null | undefined;
  form?: StateForm | null | undefined;
  session?: string | null | undefined;
  subscription: string;
  viewName: string;
  viewStages?: Array | null | undefined;
};
export type createSavedViewMutation$data = {
  readonly createSavedView: {
    readonly color: string | null | undefined;
    readonly createdAt: number | null | undefined;
    readonly datasetId: string | null | undefined;
    readonly description: string | null | undefined;
    readonly id: string | null | undefined;
    readonly name: string | null | undefined;
    readonly slug: string | null | undefined;
    readonly viewStages: ReadonlyArray<string> | null | undefined;
  } | null | undefined;
};
export type createSavedViewMutation = {
  response: createSavedViewMutation$data;
  variables: createSavedViewMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "color"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "datasetName"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "form"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v7 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewStages"
},
v8 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "color",
        "variableName": "color"
      },
      {
        "kind": "Variable",
        "name": "datasetName",
        "variableName": "datasetName"
      },
      {
        "kind": "Variable",
        "name": "description",
        "variableName": "description"
      },
      {
        "kind": "Variable",
        "name": "form",
        "variableName": "form"
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
        "name": "viewName",
        "variableName": "viewName"
      },
      {
        "kind": "Variable",
        "name": "viewStages",
        "variableName": "viewStages"
      }
    ],
    "concreteType": "SavedView",
    "kind": "LinkedField",
    "name": "createSavedView",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "id",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "datasetId",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "color",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "viewStages",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "createdAt",
        "storageKey": null
      }
    ],
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
      (v5/*:: as any*/),
      (v6/*:: as any*/),
      (v7/*:: as any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "createSavedViewMutation",
    "selections": (v8/*:: as any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v5/*:: as any*/),
      (v4/*:: as any*/),
      (v6/*:: as any*/),
      (v7/*:: as any*/),
      (v1/*:: as any*/),
      (v2/*:: as any*/),
      (v0/*:: as any*/),
      (v3/*:: as any*/)
    ],
    "kind": "Operation",
    "name": "createSavedViewMutation",
    "selections": (v8/*:: as any*/)
  },
  "params": {
    "cacheID": "394266ec53b6d4eeb1710d03f7cb9dbb",
    "id": null,
    "metadata": {},
    "name": "createSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation createSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $viewStages: BSONArray\n  $datasetName: String = null\n  $description: String = null\n  $color: String = null\n  $form: StateForm = null\n) {\n  createSavedView(subscription: $subscription, session: $session, viewName: $viewName, viewStages: $viewStages, datasetName: $datasetName, description: $description, color: $color, form: $form) {\n    id\n    datasetId\n    name\n    description\n    slug\n    color\n    viewStages\n    createdAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "edca4fb3baa506df972aa14983e64a98";

export default node;
