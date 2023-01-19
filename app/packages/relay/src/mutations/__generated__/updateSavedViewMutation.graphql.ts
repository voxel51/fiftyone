/**
 * @generated SignedSource<<fc30f9e4c60484f327aaa4c7a0d0a600>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type SavedViewInfo = {
  color?: string | null;
  description?: string | null;
  name?: string | null;
};
export type updateSavedViewMutation$variables = {
  datasetName?: string | null;
  session?: string | null;
  subscription: string;
  updatedInfo: SavedViewInfo;
  viewName: string;
};
export type updateSavedViewMutation$data = {
  readonly updateSavedView: {
    readonly color: string | null;
    readonly createdAt: any | null;
    readonly datasetId: string | null;
    readonly description: string | null;
    readonly id: string | null;
    readonly lastLoadedAt: any | null;
    readonly lastModifiedAt: any | null;
    readonly name: string | null;
    readonly slug: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  } | null;
};
export type updateSavedViewMutation = {
  response: updateSavedViewMutation$data;
  variables: updateSavedViewMutation$variables;
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
  "name": "session"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "updatedInfo"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v5 = [
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
        "name": "updatedInfo",
        "variableName": "updatedInfo"
      },
      {
        "kind": "Variable",
        "name": "viewName",
        "variableName": "viewName"
      }
    ],
    "concreteType": "SavedView",
    "kind": "LinkedField",
    "name": "updateSavedView",
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
        "name": "color",
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
        "name": "viewStages",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "createdAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "lastModifiedAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "lastLoadedAt",
        "storageKey": null
      }
    ],
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
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "updateSavedViewMutation",
    "selections": (v5/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v4/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Operation",
    "name": "updateSavedViewMutation",
    "selections": (v5/*: any*/)
  },
  "params": {
    "cacheID": "2f4941915ed060fd4742d80c04837a2f",
    "id": null,
    "metadata": {},
    "name": "updateSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation updateSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $datasetName: String\n  $updatedInfo: SavedViewInfo!\n) {\n  updateSavedView(subscription: $subscription, session: $session, viewName: $viewName, datasetName: $datasetName, updatedInfo: $updatedInfo) {\n    id\n    datasetId\n    name\n    description\n    color\n    slug\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "072449b3bcac8e4b62be039b844c4989";

export default node;
