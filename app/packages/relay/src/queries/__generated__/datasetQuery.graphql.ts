/**
 * @generated SignedSource<<71652de2c78fd9ed1ed9a1b36244258d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ColorBy = "field" | "instance" | "value" | "%future added value";
export type datasetQuery$variables = {
  extendedView: Array;
  name: string;
  savedViewSlug?: string | null;
  view: Array;
};
export type datasetQuery$data = {
  readonly config: {
    readonly colorBy: ColorBy;
    readonly colorPool: ReadonlyArray<string>;
    readonly multicolorKeypoints: boolean;
    readonly showSkeletons: boolean;
  };
  readonly dataset: {
    readonly appConfig: {
      readonly colorScheme: {
        readonly colorBy: ColorBy | null;
        readonly colorPool: ReadonlyArray<string>;
        readonly fields: ReadonlyArray<{
          readonly colorByAttribute: string | null;
          readonly fieldColor: string | null;
          readonly path: string;
          readonly valueColors: ReadonlyArray<{
            readonly color: string;
            readonly value: string;
          }> | null;
        }> | null;
        readonly id: string;
        readonly labelTags: {
          readonly fieldColor: string | null;
          readonly valueColors: ReadonlyArray<{
            readonly color: string;
            readonly value: string;
          }> | null;
        } | null;
        readonly multicolorKeypoints: boolean | null;
        readonly opacity: number | null;
        readonly showSkeletons: boolean | null;
      } | null;
    } | null;
    readonly defaultGroupSlice: string | null;
    readonly name: string;
    readonly viewName: string | null;
    readonly " $fragmentSpreads": FragmentRefs<"datasetFragment">;
  } | null;
  readonly " $fragmentSpreads": FragmentRefs<"configFragment" | "savedViewsFragment" | "stageDefinitionsFragment" | "viewSchemaFragment">;
};
export type datasetQuery = {
  response: datasetQuery$data;
  variables: datasetQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "extendedView"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "savedViewSlug"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorBy",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorPool",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "multicolorKeypoints",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "showSkeletons",
  "storageKey": null
},
v8 = [
  {
    "kind": "Variable",
    "name": "name",
    "variableName": "name"
  },
  {
    "kind": "Variable",
    "name": "savedViewSlug",
    "variableName": "savedViewSlug"
  },
  {
    "kind": "Variable",
    "name": "view",
    "variableName": "extendedView"
  }
],
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "defaultGroupSlice",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewName",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "fieldColor",
  "storageKey": null
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v17 = {
  "alias": null,
  "args": null,
  "concreteType": "ColorScheme",
  "kind": "LinkedField",
  "name": "colorScheme",
  "plural": false,
  "selections": [
    (v12/*: any*/),
    (v4/*: any*/),
    (v5/*: any*/),
    (v6/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "opacity",
      "storageKey": null
    },
    (v7/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "LabelTagColor",
      "kind": "LinkedField",
      "name": "labelTags",
      "plural": false,
      "selections": [
        (v13/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "ValueColor",
          "kind": "LinkedField",
          "name": "valueColors",
          "plural": true,
          "selections": [
            (v14/*: any*/),
            (v15/*: any*/)
          ],
          "storageKey": null
        }
      ],
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
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "colorByAttribute",
          "storageKey": null
        },
        (v13/*: any*/),
        (v16/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "ValueColor",
          "kind": "LinkedField",
          "name": "valueColors",
          "plural": true,
          "selections": [
            (v15/*: any*/),
            (v14/*: any*/)
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "plugins",
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sidebarMode",
  "storageKey": null
},
v21 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v22 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "datasetId",
  "storageKey": null
},
v23 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "info",
  "storageKey": null
},
v24 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v25 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v26 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v27 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v28 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v29 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v30 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v31 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "type",
  "storageKey": null
},
v32 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "target",
    "storageKey": null
  },
  (v14/*: any*/)
],
v33 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v34 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
},
v35 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "ftype",
  "storageKey": null
},
v36 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "subfield",
  "storageKey": null
},
v37 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "embeddedDocType",
  "storageKey": null
},
v38 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "dbField",
  "storageKey": null
},
v39 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v40 = {
  "kind": "Variable",
  "name": "datasetName",
  "variableName": "name"
},
v41 = [
  (v16/*: any*/),
  (v35/*: any*/),
  (v36/*: any*/),
  (v37/*: any*/),
  (v23/*: any*/),
  (v39/*: any*/)
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
    "name": "datasetQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "AppConfig",
        "kind": "LinkedField",
        "name": "config",
        "plural": false,
        "selections": [
          (v4/*: any*/),
          (v5/*: any*/),
          (v6/*: any*/),
          (v7/*: any*/)
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": (v8/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v9/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetAppConfig",
            "kind": "LinkedField",
            "name": "appConfig",
            "plural": false,
            "selections": [
              (v17/*: any*/)
            ],
            "storageKey": null
          },
          {
            "args": null,
            "kind": "FragmentSpread",
            "name": "datasetFragment"
          }
        ],
        "storageKey": null
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "savedViewsFragment"
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "configFragment"
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "stageDefinitionsFragment"
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "viewSchemaFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v1/*: any*/),
      (v3/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "datasetQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "AppConfig",
        "kind": "LinkedField",
        "name": "config",
        "plural": false,
        "selections": [
          (v4/*: any*/),
          (v5/*: any*/),
          (v6/*: any*/),
          (v7/*: any*/),
          (v18/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "gridZoom",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "loopVideos",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "notebookHeight",
            "storageKey": null
          },
          (v19/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "showConfidence",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "showIndex",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "showLabel",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "showTooltip",
            "storageKey": null
          },
          (v20/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "theme",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "timezone",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "useFrameNumber",
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": (v8/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v9/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetAppConfig",
            "kind": "LinkedField",
            "name": "appConfig",
            "plural": false,
            "selections": [
              (v17/*: any*/),
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
              (v19/*: any*/),
              (v20/*: any*/),
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
                  (v9/*: any*/)
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v21/*: any*/),
          (v22/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "groupField",
            "storageKey": null
          },
          (v12/*: any*/),
          (v23/*: any*/),
          (v24/*: any*/),
          (v25/*: any*/),
          (v26/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "BrainRun",
            "kind": "LinkedField",
            "name": "brainMethods",
            "plural": true,
            "selections": [
              (v27/*: any*/),
              (v26/*: any*/),
              (v28/*: any*/),
              (v29/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "BrainRunConfig",
                "kind": "LinkedField",
                "name": "config",
                "plural": false,
                "selections": [
                  (v30/*: any*/),
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
                  (v31/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "maxK",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "supportsLeastSimilarity",
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
            "concreteType": "Target",
            "kind": "LinkedField",
            "name": "defaultMaskTargets",
            "plural": true,
            "selections": (v32/*: any*/),
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
              (v33/*: any*/),
              (v34/*: any*/)
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
              (v27/*: any*/),
              (v26/*: any*/),
              (v28/*: any*/),
              (v29/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "EvaluationRunConfig",
                "kind": "LinkedField",
                "name": "config",
                "plural": false,
                "selections": [
                  (v30/*: any*/),
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
            "concreteType": "Group",
            "kind": "LinkedField",
            "name": "groupMediaTypes",
            "plural": true,
            "selections": [
              (v9/*: any*/),
              (v25/*: any*/)
            ],
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
              (v9/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "Target",
                "kind": "LinkedField",
                "name": "targets",
                "plural": true,
                "selections": (v32/*: any*/),
                "storageKey": null
              }
            ],
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
              (v9/*: any*/),
              (v33/*: any*/),
              (v34/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "frameFields",
            "plural": true,
            "selections": [
              (v35/*: any*/),
              (v36/*: any*/),
              (v37/*: any*/),
              (v16/*: any*/),
              (v38/*: any*/),
              (v39/*: any*/),
              (v23/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "sampleFields",
            "plural": true,
            "selections": [
              (v16/*: any*/),
              (v35/*: any*/),
              (v36/*: any*/),
              (v37/*: any*/),
              (v38/*: any*/),
              (v39/*: any*/),
              (v23/*: any*/)
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
              },
              {
                "kind": "Variable",
                "name": "view",
                "variableName": "view"
              }
            ],
            "kind": "ScalarField",
            "name": "stages",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "viewCls",
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": [
          (v40/*: any*/)
        ],
        "concreteType": "SavedView",
        "kind": "LinkedField",
        "name": "savedViews",
        "plural": true,
        "selections": [
          (v12/*: any*/),
          (v22/*: any*/),
          (v9/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "slug",
            "storageKey": null
          },
          (v39/*: any*/),
          (v15/*: any*/),
          (v29/*: any*/),
          (v21/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          (v24/*: any*/)
        ],
        "storageKey": null
      },
      (v18/*: any*/),
      {
        "alias": null,
        "args": null,
        "concreteType": "StageDefinition",
        "kind": "LinkedField",
        "name": "stageDefinitions",
        "plural": true,
        "selections": [
          (v9/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "StageParameter",
            "kind": "LinkedField",
            "name": "params",
            "plural": true,
            "selections": [
              (v9/*: any*/),
              (v31/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "default",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "placeholder",
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
        "args": [
          (v40/*: any*/),
          {
            "kind": "Variable",
            "name": "viewStages",
            "variableName": "view"
          }
        ],
        "concreteType": "SchemaResult",
        "kind": "LinkedField",
        "name": "schemaForViewStages",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "fieldSchema",
            "plural": true,
            "selections": (v41/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "frameFieldSchema",
            "plural": true,
            "selections": (v41/*: any*/),
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "ee60e4726cb97be0d77e163282969545",
    "id": null,
    "metadata": {},
    "name": "datasetQuery",
    "operationKind": "query",
    "text": "query datasetQuery(\n  $savedViewSlug: String\n  $name: String!\n  $view: BSONArray!\n  $extendedView: BSONArray!\n) {\n  config {\n    colorBy\n    colorPool\n    multicolorKeypoints\n    showSkeletons\n  }\n  dataset(name: $name, view: $extendedView, savedViewSlug: $savedViewSlug) {\n    name\n    defaultGroupSlice\n    viewName\n    appConfig {\n      colorScheme {\n        id\n        colorBy\n        colorPool\n        multicolorKeypoints\n        opacity\n        showSkeletons\n        labelTags {\n          fieldColor\n          valueColors {\n            value\n            color\n          }\n        }\n        fields {\n          colorByAttribute\n          fieldColor\n          path\n          valueColors {\n            color\n            value\n          }\n        }\n      }\n    }\n    ...datasetFragment\n    id\n  }\n  ...savedViewsFragment\n  ...configFragment\n  ...stageDefinitionsFragment\n  ...viewSchemaFragment\n}\n\nfragment configFragment on Query {\n  config {\n    colorBy\n    colorPool\n    colorscale\n    gridZoom\n    loopVideos\n    multicolorKeypoints\n    notebookHeight\n    plugins\n    showConfidence\n    showIndex\n    showLabel\n    showSkeletons\n    showTooltip\n    sidebarMode\n    theme\n    timezone\n    useFrameNumber\n  }\n  colorscale\n}\n\nfragment datasetAppConfigFragment on DatasetAppConfig {\n  gridMediaField\n  mediaFields\n  modalMediaField\n  plugins\n  sidebarMode\n  colorScheme {\n    id\n    colorBy\n    colorPool\n    multicolorKeypoints\n    opacity\n    showSkeletons\n    labelTags {\n      fieldColor\n      valueColors {\n        color\n        value\n      }\n    }\n    fields {\n      colorByAttribute\n      fieldColor\n      path\n      valueColors {\n        color\n        value\n      }\n    }\n  }\n}\n\nfragment datasetFragment on Dataset {\n  createdAt\n  datasetId\n  groupField\n  id\n  info\n  lastLoadedAt\n  mediaType\n  name\n  version\n  appConfig {\n    ...datasetAppConfigFragment\n  }\n  brainMethods {\n    key\n    version\n    timestamp\n    viewStages\n    config {\n      cls\n      embeddingsField\n      method\n      patchesField\n      supportsPrompts\n      type\n      maxK\n      supportsLeastSimilarity\n    }\n  }\n  defaultMaskTargets {\n    target\n    value\n  }\n  defaultSkeleton {\n    labels\n    edges\n  }\n  evaluations {\n    key\n    version\n    timestamp\n    viewStages\n    config {\n      cls\n      predField\n      gtField\n    }\n  }\n  groupMediaTypes {\n    name\n    mediaType\n  }\n  maskTargets {\n    name\n    targets {\n      target\n      value\n    }\n  }\n  skeletons {\n    name\n    labels\n    edges\n  }\n  ...frameFieldsFragment\n  ...groupSliceFragment\n  ...mediaFieldsFragment\n  ...mediaTypeFragment\n  ...sampleFieldsFragment\n  ...sidebarGroupsFragment\n  ...viewFragment\n}\n\nfragment frameFieldsFragment on Dataset {\n  frameFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment groupSliceFragment on Dataset {\n  defaultGroupSlice\n}\n\nfragment mediaFieldsFragment on Dataset {\n  name\n  appConfig {\n    gridMediaField\n    mediaFields\n  }\n  sampleFields {\n    path\n  }\n}\n\nfragment mediaTypeFragment on Dataset {\n  mediaType\n}\n\nfragment sampleFieldsFragment on Dataset {\n  sampleFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment savedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n\nfragment sidebarGroupsFragment on Dataset {\n  name\n  appConfig {\n    sidebarGroups {\n      expanded\n      paths\n      name\n    }\n  }\n  ...frameFieldsFragment\n  ...sampleFieldsFragment\n}\n\nfragment stageDefinitionsFragment on Query {\n  stageDefinitions {\n    name\n    params {\n      name\n      type\n      default\n      placeholder\n    }\n  }\n}\n\nfragment viewFragment on Dataset {\n  stages(slug: $savedViewSlug, view: $view)\n  viewCls\n  viewName\n}\n\nfragment viewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $view) {\n    fieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n      info\n      description\n    }\n    frameFieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n      info\n      description\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "3dc7678ffff4c7577e35f7abfc05e76c";

export default node;
