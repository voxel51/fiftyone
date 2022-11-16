/**
 * @generated SignedSource<<1b1b4787ec31734f321e85b1f59dfad1>>
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
  session?: string | null;
  subscription: string;
  updatedInfo: SavedViewInfo;
  viewName: string;
};
export type updateSavedViewMutation$data = {
  readonly updateSavedView: {
    readonly color: string | null;
    readonly createdAt: any;
    readonly description: string | null;
    readonly id: string;
    readonly lastLoadedAt: any | null;
    readonly lastModifiedAt: any | null;
    readonly name: string;
    readonly urlName: string;
    readonly viewStages: ReadonlyArray<string>;
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
  "name": "updatedInfo"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "viewName"
},
v4 = [
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
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "urlName",
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
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "updateSavedViewMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "updateSavedViewMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "ad2d7096302b27f93587349155aba277",
    "id": null,
    "metadata": {},
    "name": "updateSavedViewMutation",
    "operationKind": "mutation",
    "text": "mutation updateSavedViewMutation(\n  $subscription: String!\n  $session: String\n  $viewName: String!\n  $updatedInfo: SavedViewInfo!\n) {\n  updateSavedView(subscription: $subscription, session: $session, viewName: $viewName, updatedInfo: $updatedInfo) {\n    id\n    name\n    urlName\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "bb1eca18548c272a33cc58d31d27f629";

export default node;
