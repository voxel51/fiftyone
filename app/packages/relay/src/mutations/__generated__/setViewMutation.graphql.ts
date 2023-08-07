/**
 * @generated SignedSource<<9a56b245547f6f98017065bf6ecd2135>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type BrainRunType = "similarity" | "visualization" | "%future added value";
export type MediaType = "group" | "image" | "point_cloud" | "video" | "%future added value";
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
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
  readonly setView: {
    readonly dataset: {
      readonly appConfig: {
        readonly colorScheme: {
          readonly colorPool: ReadonlyArray<string> | null;
          readonly fields: ReadonlyArray<{
            readonly colorByAttribute: string | null;
            readonly fieldColor: string | null;
            readonly path: string;
            readonly valueColors: ReadonlyArray<{
              readonly color: string;
              readonly value: string;
            }> | null;
          }> | null;
        } | null;
        readonly gridMediaField: string | null;
        readonly mediaFields: ReadonlyArray<string> | null;
        readonly modalMediaField: string | null;
        readonly plugins: object | null;
        readonly sidebarGroups: ReadonlyArray<{
          readonly expanded: boolean | null;
          readonly name: string;
          readonly paths: ReadonlyArray<string> | null;
        }> | null;
        readonly sidebarMode: SidebarMode | null;
      } | null;
      readonly brainMethods: ReadonlyArray<{
        readonly config: {
          readonly cls: string;
          readonly embeddingsField: string | null;
          readonly method: string | null;
          readonly patchesField: string | null;
          readonly supportsPrompts: boolean | null;
          readonly type: BrainRunType | null;
        } | null;
        readonly key: string;
        readonly timestamp: any | null;
        readonly version: string | null;
        readonly viewStages: ReadonlyArray<string> | null;
      }> | null;
      readonly createdAt: any | null;
      readonly defaultGroupSlice: string | null;
      readonly defaultMaskTargets: ReadonlyArray<{
        readonly target: string;
        readonly value: string;
      }> | null;
      readonly defaultSkeleton: {
        readonly edges: ReadonlyArray<ReadonlyArray<number>>;
        readonly labels: ReadonlyArray<string> | null;
      } | null;
      readonly evaluations: ReadonlyArray<{
        readonly config: {
          readonly cls: string;
          readonly gtField: string | null;
          readonly predField: string | null;
        } | null;
        readonly key: string;
        readonly timestamp: any | null;
        readonly version: string | null;
        readonly viewStages: ReadonlyArray<string> | null;
      }> | null;
      readonly frameFields: ReadonlyArray<{
        readonly dbField: string | null;
        readonly description: string | null;
        readonly embeddedDocType: string | null;
        readonly ftype: string;
        readonly info: object | null;
        readonly path: string;
        readonly subfield: string | null;
      }> | null;
      readonly groupField: string | null;
      readonly groupMediaTypes: ReadonlyArray<{
        readonly mediaType: MediaType;
        readonly name: string;
      }> | null;
      readonly groupSlice: string | null;
      readonly id: string;
      readonly lastLoadedAt: any | null;
      readonly maskTargets: ReadonlyArray<{
        readonly name: string;
        readonly targets: ReadonlyArray<{
          readonly target: string;
          readonly value: string;
        }>;
      }>;
      readonly mediaType: MediaType | null;
      readonly name: string;
      readonly parentMediaType: MediaType | null;
      readonly sampleFields: ReadonlyArray<{
        readonly dbField: string | null;
        readonly description: string | null;
        readonly embeddedDocType: string | null;
        readonly ftype: string;
        readonly info: object | null;
        readonly path: string;
        readonly subfield: string | null;
      }>;
      readonly savedViews: ReadonlyArray<{
        readonly color: string | null;
        readonly createdAt: any | null;
        readonly description: string | null;
        readonly id: string | null;
        readonly lastLoadedAt: any | null;
        readonly lastModifiedAt: any | null;
        readonly name: string | null;
        readonly slug: string | null;
        readonly viewStages: ReadonlyArray<string> | null;
      }> | null;
      readonly skeletons: ReadonlyArray<{
        readonly edges: ReadonlyArray<ReadonlyArray<number>>;
        readonly labels: ReadonlyArray<string> | null;
        readonly name: string;
      }>;
      readonly stages: Array | null;
      readonly version: string | null;
      readonly viewCls: string | null;
      readonly viewName: string | null;
    };
    readonly view: Array;
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
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v11 = [
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
  (v9/*: any*/),
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "dbField",
    "storageKey": null
  },
  (v10/*: any*/),
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "info",
    "storageKey": null
  }
],
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
},
v13 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "target",
    "storageKey": null
  },
  (v12/*: any*/)
],
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v17 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v21 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v22 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v23 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
},
v24 = [
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
          (v6/*: any*/),
          (v7/*: any*/),
          (v8/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "parentMediaType",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "groupSlice",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "defaultGroupSlice",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "groupField",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Group",
            "kind": "LinkedField",
            "name": "groupMediaTypes",
            "plural": true,
            "selections": [
              (v7/*: any*/),
              (v8/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": [
              {
                "kind": "Variable",
                "name": "slug",
                "variableName": "savedViewSlug"
              }
            ],
            "kind": "ScalarField",
            "name": "stages",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "sampleFields",
            "plural": true,
            "selections": (v11/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "frameFields",
            "plural": true,
            "selections": (v11/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "NamedTargets",
            "kind": "LinkedField",
            "name": "maskTargets",
            "plural": true,
            "selections": [
              (v7/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "Target",
                "kind": "LinkedField",
                "name": "targets",
                "plural": true,
                "selections": (v13/*: any*/),
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Target",
            "kind": "LinkedField",
            "name": "defaultMaskTargets",
            "plural": true,
            "selections": (v13/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SavedView",
            "kind": "LinkedField",
            "name": "savedViews",
            "plural": true,
            "selections": [
              (v6/*: any*/),
              (v7/*: any*/),
              (v10/*: any*/),
              (v14/*: any*/),
              (v15/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "slug",
                "storageKey": null
              },
              (v16/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "lastModifiedAt",
                "storageKey": null
              },
              (v17/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "EvaluationRun",
            "kind": "LinkedField",
            "name": "evaluations",
            "plural": true,
            "selections": [
              (v18/*: any*/),
              (v19/*: any*/),
              (v20/*: any*/),
              (v15/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "EvaluationRunConfig",
                "kind": "LinkedField",
                "name": "config",
                "plural": false,
                "selections": [
                  (v21/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "predField",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "gtField",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "BrainRun",
            "kind": "LinkedField",
            "name": "brainMethods",
            "plural": true,
            "selections": [
              (v18/*: any*/),
              (v19/*: any*/),
              (v20/*: any*/),
              (v15/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "BrainRunConfig",
                "kind": "LinkedField",
                "name": "config",
                "plural": false,
                "selections": [
                  (v21/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "embeddingsField",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "method",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "patchesField",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "supportsPrompts",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "type",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v17/*: any*/),
          (v16/*: any*/),
          (v19/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "viewCls",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "viewName",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "NamedKeypointSkeleton",
            "kind": "LinkedField",
            "name": "skeletons",
            "plural": true,
            "selections": [
              (v7/*: any*/),
              (v22/*: any*/),
              (v23/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "KeypointSkeleton",
            "kind": "LinkedField",
            "name": "defaultSkeleton",
            "plural": false,
            "selections": [
              (v22/*: any*/),
              (v23/*: any*/)
            ],
            "storageKey": null
          },
          {
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
                "kind": "ScalarField",
                "name": "gridMediaField",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "mediaFields",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "modalMediaField",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "plugins",
                "storageKey": null
              },
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
                  (v7/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "paths",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "sidebarMode",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "ColorScheme",
                "kind": "LinkedField",
                "name": "colorScheme",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "colorPool",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "CustomizeColor",
                    "kind": "LinkedField",
                    "name": "fields",
                    "plural": true,
                    "selections": [
                      (v9/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "fieldColor",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "colorByAttribute",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "LabelSetting",
                        "kind": "LinkedField",
                        "name": "valueColors",
                        "plural": true,
                        "selections": [
                          (v12/*: any*/),
                          (v14/*: any*/)
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "view",
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
      (v4/*: any*/),
      (v5/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "setViewMutation",
    "selections": (v24/*: any*/),
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
    "selections": (v24/*: any*/)
  },
  "params": {
    "cacheID": "e8f9bad750a3495476591dfef14908ff",
    "id": null,
    "metadata": {},
    "name": "setViewMutation",
    "operationKind": "mutation",
    "text": "mutation setViewMutation(\n  $subscription: String!\n  $session: String\n  $view: BSONArray!\n  $savedViewSlug: String\n  $datasetName: String!\n  $form: StateForm!\n) {\n  setView(subscription: $subscription, session: $session, view: $view, savedViewSlug: $savedViewSlug, datasetName: $datasetName, form: $form) {\n    dataset {\n      id\n      name\n      mediaType\n      parentMediaType\n      groupSlice\n      defaultGroupSlice\n      groupField\n      groupMediaTypes {\n        name\n        mediaType\n      }\n      stages(slug: $savedViewSlug)\n      sampleFields {\n        ftype\n        subfield\n        embeddedDocType\n        path\n        dbField\n        description\n        info\n      }\n      frameFields {\n        ftype\n        subfield\n        embeddedDocType\n        path\n        dbField\n        description\n        info\n      }\n      maskTargets {\n        name\n        targets {\n          target\n          value\n        }\n      }\n      defaultMaskTargets {\n        target\n        value\n      }\n      savedViews {\n        id\n        name\n        description\n        color\n        viewStages\n        slug\n        createdAt\n        lastModifiedAt\n        lastLoadedAt\n      }\n      evaluations {\n        key\n        version\n        timestamp\n        viewStages\n        config {\n          cls\n          predField\n          gtField\n        }\n      }\n      brainMethods {\n        key\n        version\n        timestamp\n        viewStages\n        config {\n          cls\n          embeddingsField\n          method\n          patchesField\n          supportsPrompts\n          type\n        }\n      }\n      lastLoadedAt\n      createdAt\n      version\n      viewCls\n      viewName\n      skeletons {\n        name\n        labels\n        edges\n      }\n      defaultSkeleton {\n        labels\n        edges\n      }\n      appConfig {\n        gridMediaField\n        mediaFields\n        modalMediaField\n        plugins\n        sidebarGroups {\n          expanded\n          name\n          paths\n        }\n        sidebarMode\n        colorScheme {\n          colorPool\n          fields {\n            path\n            fieldColor\n            colorByAttribute\n            valueColors {\n              value\n              color\n            }\n          }\n        }\n      }\n    }\n    view\n  }\n}\n"
  }
};
})();

(node as any).hash = "42e390ca6418574759b88418f03dc753";

export default node;
