/**
 * @generated SignedSource<<49dde11b97f26148747cff756b1bbc0f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type StateForm = {
  addStages?: any | null;
  extended?: any | null;
  filters?: any | null;
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
  datasetName?: string | null;
  form: StateForm;
  savedViewSlug?: string | null;
  session?: string | null;
  subscription: string;
  view: any;
};
export type setViewMutation$data = {
  readonly setView: {
    readonly dataset: {
      readonly viewCls: string | null;
      readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment" | "groupSliceFragment" | "mediaTypeFragment" | "sampleFieldsFragment" | "sidebarGroupsFragment">;
    };
    readonly view: any;
  };
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
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewCls",
  "storageKey": null
},
v8 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "ftype",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "subfield",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "embeddedDocType",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "path",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "dbField",
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
    "name": "info",
    "storageKey": null
  }
],
v9 = {
  "alias": null,
  "args": null,
  "concreteType": "SampleField",
  "kind": "LinkedField",
  "name": "frameFields",
  "plural": true,
  "selections": (v8/*: any*/),
  "storageKey": null
},
v10 = {
  "kind": "InlineDataFragmentSpread",
  "name": "frameFieldsFragment",
  "selections": [
    (v9/*: any*/)
  ],
  "args": null,
  "argumentDefinitions": ([]/*: any*/)
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "groupSlice",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "concreteType": "SampleField",
  "kind": "LinkedField",
  "name": "sampleFields",
  "plural": true,
  "selections": (v8/*: any*/),
  "storageKey": null
},
v14 = {
  "kind": "InlineDataFragmentSpread",
  "name": "sampleFieldsFragment",
  "selections": [
    (v13/*: any*/)
  ],
  "args": null,
  "argumentDefinitions": ([]/*: any*/)
},
v15 = {
  "alias": null,
  "args": null,
  "concreteType": "DatasetAppConfig",
  "kind": "LinkedField",
  "name": "appConfig",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "SidebarGroup",
      "kind": "LinkedField",
      "name": "sidebarGroups",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "expanded",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "paths",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "name",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "view",
  "storageKey": null
};
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
    "selections": [
      {
        "alias": null,
        "args": (v6/*: any*/),
        "concreteType": "ViewResponse",
        "kind": "LinkedField",
        "name": "setView",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "dataset",
            "plural": false,
            "selections": [
              (v7/*: any*/),
              (v10/*: any*/),
              {
                "kind": "InlineDataFragmentSpread",
                "name": "mediaTypeFragment",
                "selections": [
                  (v11/*: any*/)
                ],
                "args": null,
                "argumentDefinitions": []
              },
              {
                "kind": "InlineDataFragmentSpread",
                "name": "groupSliceFragment",
                "selections": [
                  (v12/*: any*/)
                ],
                "args": null,
                "argumentDefinitions": []
              },
              (v14/*: any*/),
              {
                "kind": "InlineDataFragmentSpread",
                "name": "sidebarGroupsFragment",
                "selections": [
                  (v15/*: any*/),
                  (v10/*: any*/),
                  (v14/*: any*/)
                ],
                "args": null,
                "argumentDefinitions": []
              }
            ],
            "storageKey": null
          },
          (v16/*: any*/)
        ],
        "storageKey": null
      }
    ],
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
    "selections": [
      {
        "alias": null,
        "args": (v6/*: any*/),
        "concreteType": "ViewResponse",
        "kind": "LinkedField",
        "name": "setView",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "dataset",
            "plural": false,
            "selections": [
              (v7/*: any*/),
              (v9/*: any*/),
              (v11/*: any*/),
              (v12/*: any*/),
              (v13/*: any*/),
              (v15/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "id",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v16/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "83af1c5a15dd0cf847ce2d1e089ae4ca",
    "id": null,
    "metadata": {},
    "name": "setViewMutation",
    "operationKind": "mutation",
    "text": "mutation setViewMutation(\n  $subscription: String!\n  $session: String\n  $view: BSONArray!\n  $savedViewSlug: String\n  $datasetName: String\n  $form: StateForm!\n) {\n  setView(subscription: $subscription, session: $session, view: $view, savedViewSlug: $savedViewSlug, datasetName: $datasetName, form: $form) {\n    dataset {\n      viewCls\n      ...frameFieldsFragment\n      ...mediaTypeFragment\n      ...groupSliceFragment\n      ...sampleFieldsFragment\n      ...sidebarGroupsFragment\n      id\n    }\n    view\n  }\n}\n\nfragment frameFieldsFragment on Dataset {\n  frameFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment groupSliceFragment on Dataset {\n  groupSlice\n}\n\nfragment mediaTypeFragment on Dataset {\n  mediaType\n}\n\nfragment sampleFieldsFragment on Dataset {\n  sampleFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment sidebarGroupsFragment on Dataset {\n  appConfig {\n    sidebarGroups {\n      expanded\n      paths\n      name\n    }\n  }\n  ...frameFieldsFragment\n  ...sampleFieldsFragment\n}\n"
  }
};
})();

(node as any).hash = "90a879cdc2f90d5f544358f35162405d";

export default node;
