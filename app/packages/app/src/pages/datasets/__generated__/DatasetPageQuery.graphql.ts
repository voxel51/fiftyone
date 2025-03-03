/**
 * @generated SignedSource<<f30db9e0b088ac9142c968f522ebb649>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ColorBy = "field" | "instance" | "value" | "%future added value";
export type DatasetPageQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  extendedView: Array;
  name: string;
  savedViewSlug?: string | null;
  search?: string | null;
  view: Array;
};
export type DatasetPageQuery$data = {
  readonly colorscale: ReadonlyArray<ReadonlyArray<number>> | null;
  readonly config: {
    readonly colorBy: ColorBy;
    readonly colorPool: ReadonlyArray<string>;
    readonly colorscale: string;
    readonly multicolorKeypoints: boolean;
    readonly showSkeletons: boolean;
  };
  readonly dataset: {
    readonly appConfig: {
      readonly colorScheme: {
        readonly colorBy: ColorBy | null;
        readonly colorPool: ReadonlyArray<string>;
        readonly colorscales: ReadonlyArray<{
          readonly list: ReadonlyArray<{
            readonly color: string;
            readonly value: number;
          }> | null;
          readonly name: string | null;
          readonly path: string;
          readonly rgb: ReadonlyArray<ReadonlyArray<number>> | null;
        }> | null;
        readonly defaultColorscale: {
          readonly list: ReadonlyArray<{
            readonly color: string;
            readonly value: number;
          }> | null;
          readonly name: string | null;
          readonly rgb: ReadonlyArray<ReadonlyArray<number>> | null;
        } | null;
        readonly defaultMaskTargetsColors: ReadonlyArray<{
          readonly color: string;
          readonly intTarget: number;
        }> | null;
        readonly fields: ReadonlyArray<{
          readonly colorByAttribute: string | null;
          readonly fieldColor: string | null;
          readonly maskTargetsColors: ReadonlyArray<{
            readonly color: string;
            readonly intTarget: number;
          }> | null;
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
    readonly " $fragmentSpreads": FragmentRefs<"datasetFragment">;
  } | null;
  readonly " $fragmentSpreads": FragmentRefs<"NavFragment" | "configFragment" | "savedViewsFragment" | "stageDefinitionsFragment" | "viewSchemaFragment">;
};
export type DatasetPageQuery = {
  response: DatasetPageQuery$data;
  variables: DatasetPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "count"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "cursor"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "extendedView"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "savedViewSlug"
},
v5 = {
  "defaultValue": "",
  "kind": "LocalArgument",
  "name": "search"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorBy",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorPool",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "multicolorKeypoints",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "showSkeletons",
  "storageKey": null
},
v12 = [
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
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "defaultGroupSlice",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v17 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "intTarget",
    "storageKey": null
  },
  (v16/*: any*/)
],
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "concreteType": "ColorscaleList",
  "kind": "LinkedField",
  "name": "list",
  "plural": true,
  "selections": [
    (v18/*: any*/),
    (v16/*: any*/)
  ],
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "rgb",
  "storageKey": null
},
v21 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v22 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "fieldColor",
  "storageKey": null
},
v23 = {
  "alias": null,
  "args": null,
  "concreteType": "ValueColor",
  "kind": "LinkedField",
  "name": "valueColors",
  "plural": true,
  "selections": [
    (v16/*: any*/),
    (v18/*: any*/)
  ],
  "storageKey": null
},
v24 = {
  "alias": null,
  "args": null,
  "concreteType": "ColorScheme",
  "kind": "LinkedField",
  "name": "colorScheme",
  "plural": false,
  "selections": [
    (v15/*: any*/),
    (v7/*: any*/),
    (v8/*: any*/),
    (v10/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "opacity",
      "storageKey": null
    },
    (v11/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "MaskColor",
      "kind": "LinkedField",
      "name": "defaultMaskTargetsColors",
      "plural": true,
      "selections": (v17/*: any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "DefaultColorscale",
      "kind": "LinkedField",
      "name": "defaultColorscale",
      "plural": false,
      "selections": [
        (v13/*: any*/),
        (v19/*: any*/),
        (v20/*: any*/)
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "Colorscale",
      "kind": "LinkedField",
      "name": "colorscales",
      "plural": true,
      "selections": [
        (v21/*: any*/),
        (v13/*: any*/),
        (v19/*: any*/),
        (v20/*: any*/)
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
        (v22/*: any*/),
        (v21/*: any*/),
        (v23/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "MaskColor",
          "kind": "LinkedField",
          "name": "maskTargetsColors",
          "plural": true,
          "selections": (v17/*: any*/),
          "storageKey": null
        }
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "LabelTagColor",
      "kind": "LinkedField",
      "name": "labelTags",
      "plural": false,
      "selections": [
        (v22/*: any*/),
        (v23/*: any*/)
      ],
      "storageKey": null
    }
  ],
  "storageKey": null
},
v25 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "disableFrameFiltering",
  "storageKey": null
},
v26 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaFallback",
  "storageKey": null
},
v27 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "plugins",
  "storageKey": null
},
v28 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v29 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "datasetId",
  "storageKey": null
},
v30 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "info",
  "storageKey": null
},
v31 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v32 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v33 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v34 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v35 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v36 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v37 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v38 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "type",
  "storageKey": null
},
v39 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "target",
    "storageKey": null
  },
  (v18/*: any*/)
],
v40 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v41 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
},
v42 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "ftype",
  "storageKey": null
},
v43 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "subfield",
  "storageKey": null
},
v44 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "embeddedDocType",
  "storageKey": null
},
v45 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "dbField",
  "storageKey": null
},
v46 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v47 = [
  (v13/*: any*/),
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "unique",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "concreteType": "IndexFields",
    "kind": "LinkedField",
    "name": "key",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "field",
        "storageKey": null
      },
      (v38/*: any*/)
    ],
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "concreteType": "WildcardProjection",
    "kind": "LinkedField",
    "name": "wildcardProjection",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "fields",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "inclusion",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
],
v48 = [
  {
    "kind": "Variable",
    "name": "after",
    "variableName": "cursor"
  },
  {
    "kind": "Variable",
    "name": "first",
    "variableName": "count"
  },
  {
    "kind": "Variable",
    "name": "search",
    "variableName": "search"
  }
],
v49 = {
  "kind": "Variable",
  "name": "datasetName",
  "variableName": "name"
},
v50 = [
  (v21/*: any*/),
  (v42/*: any*/),
  (v43/*: any*/),
  (v44/*: any*/),
  (v30/*: any*/),
  (v46/*: any*/)
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetPageQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "AppConfig",
        "kind": "LinkedField",
        "name": "config",
        "plural": false,
        "selections": [
          (v7/*: any*/),
          (v8/*: any*/),
          (v9/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/)
        ],
        "storageKey": null
      },
      (v9/*: any*/),
      {
        "alias": null,
        "args": (v12/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v13/*: any*/),
          (v14/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetAppConfig",
            "kind": "LinkedField",
            "name": "appConfig",
            "plural": false,
            "selections": [
              (v24/*: any*/)
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
        "name": "NavFragment"
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
      (v0/*: any*/),
      (v1/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetPageQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "AppConfig",
        "kind": "LinkedField",
        "name": "config",
        "plural": false,
        "selections": [
          (v7/*: any*/),
          (v8/*: any*/),
          (v9/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/),
          (v25/*: any*/),
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
            "name": "enableQueryPerformance",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "defaultQueryPerformance",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "loopVideos",
            "storageKey": null
          },
          (v26/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "notebookHeight",
            "storageKey": null
          },
          (v27/*: any*/),
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
      (v9/*: any*/),
      {
        "alias": null,
        "args": (v12/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v13/*: any*/),
          (v14/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetAppConfig",
            "kind": "LinkedField",
            "name": "appConfig",
            "plural": false,
            "selections": [
              (v24/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "FieldVisibilityConfig",
                "kind": "LinkedField",
                "name": "defaultVisibilityLabels",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "include",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "exclude",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              },
              (v25/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "dynamicGroupsTargetFrameRate",
                "storageKey": null
              },
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
              (v26/*: any*/),
              (v27/*: any*/),
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
                  (v13/*: any*/)
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          (v28/*: any*/),
          (v29/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "groupField",
            "storageKey": null
          },
          (v15/*: any*/),
          (v30/*: any*/),
          (v31/*: any*/),
          (v32/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "parentMediaType",
            "storageKey": null
          },
          (v33/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "BrainRun",
            "kind": "LinkedField",
            "name": "brainMethods",
            "plural": true,
            "selections": [
              (v34/*: any*/),
              (v33/*: any*/),
              (v35/*: any*/),
              (v36/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "BrainRunConfig",
                "kind": "LinkedField",
                "name": "config",
                "plural": false,
                "selections": [
                  (v37/*: any*/),
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
                  (v38/*: any*/),
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
            "selections": (v39/*: any*/),
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
              (v40/*: any*/),
              (v41/*: any*/)
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
              (v34/*: any*/),
              (v33/*: any*/),
              (v35/*: any*/),
              (v36/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "EvaluationRunConfig",
                "kind": "LinkedField",
                "name": "config",
                "plural": false,
                "selections": [
                  (v37/*: any*/),
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
              (v13/*: any*/),
              (v32/*: any*/)
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
              (v13/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "Target",
                "kind": "LinkedField",
                "name": "targets",
                "plural": true,
                "selections": (v39/*: any*/),
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
              (v13/*: any*/),
              (v40/*: any*/),
              (v41/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "estimatedFrameCount",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "estimatedSampleCount",
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
              (v42/*: any*/),
              (v43/*: any*/),
              (v44/*: any*/),
              (v21/*: any*/),
              (v45/*: any*/),
              (v46/*: any*/),
              (v30/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Index",
            "kind": "LinkedField",
            "name": "frameIndexes",
            "plural": true,
            "selections": (v47/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "Index",
            "kind": "LinkedField",
            "name": "sampleIndexes",
            "plural": true,
            "selections": (v47/*: any*/),
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
              (v21/*: any*/),
              (v42/*: any*/),
              (v43/*: any*/),
              (v44/*: any*/),
              (v45/*: any*/),
              (v46/*: any*/),
              (v30/*: any*/)
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
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "viewName",
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "context",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "dev",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "doNotTrack",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "uid",
        "storageKey": null
      },
      (v33/*: any*/),
      {
        "alias": null,
        "args": (v48/*: any*/),
        "concreteType": "DatasetStrConnection",
        "kind": "LinkedField",
        "name": "datasets",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "total",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetStrEdge",
            "kind": "LinkedField",
            "name": "edges",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "cursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "Dataset",
                "kind": "LinkedField",
                "name": "node",
                "plural": false,
                "selections": [
                  (v13/*: any*/),
                  (v15/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "__typename",
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
            "concreteType": "DatasetStrPageInfo",
            "kind": "LinkedField",
            "name": "pageInfo",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "endCursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "hasNextPage",
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
        "args": (v48/*: any*/),
        "filters": [
          "search"
        ],
        "handle": "connection",
        "key": "DatasetsList_query_datasets",
        "kind": "LinkedHandle",
        "name": "datasets"
      },
      {
        "alias": null,
        "args": [
          (v49/*: any*/)
        ],
        "concreteType": "SavedView",
        "kind": "LinkedField",
        "name": "savedViews",
        "plural": true,
        "selections": [
          (v15/*: any*/),
          (v29/*: any*/),
          (v13/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "slug",
            "storageKey": null
          },
          (v46/*: any*/),
          (v16/*: any*/),
          (v36/*: any*/),
          (v28/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          (v31/*: any*/)
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "StageDefinition",
        "kind": "LinkedField",
        "name": "stageDefinitions",
        "plural": true,
        "selections": [
          (v13/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "StageParameter",
            "kind": "LinkedField",
            "name": "params",
            "plural": true,
            "selections": [
              (v13/*: any*/),
              (v38/*: any*/),
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
          (v49/*: any*/),
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
            "selections": (v50/*: any*/),
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "SampleField",
            "kind": "LinkedField",
            "name": "frameFieldSchema",
            "plural": true,
            "selections": (v50/*: any*/),
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "6075b4fbbfbf557c858ae76d346cc506",
    "id": null,
    "metadata": {},
    "name": "DatasetPageQuery",
    "operationKind": "query",
    "text": "query DatasetPageQuery(\n  $count: Int\n  $cursor: String\n  $name: String!\n  $extendedView: BSONArray!\n  $savedViewSlug: String\n  $search: String = \"\"\n  $view: BSONArray!\n) {\n  config {\n    colorBy\n    colorPool\n    colorscale\n    multicolorKeypoints\n    showSkeletons\n  }\n  colorscale\n  dataset(name: $name, view: $extendedView, savedViewSlug: $savedViewSlug) {\n    name\n    defaultGroupSlice\n    appConfig {\n      colorScheme {\n        id\n        colorBy\n        colorPool\n        multicolorKeypoints\n        opacity\n        showSkeletons\n        defaultMaskTargetsColors {\n          intTarget\n          color\n        }\n        defaultColorscale {\n          name\n          list {\n            value\n            color\n          }\n          rgb\n        }\n        colorscales {\n          path\n          name\n          list {\n            value\n            color\n          }\n          rgb\n        }\n        fields {\n          colorByAttribute\n          fieldColor\n          path\n          valueColors {\n            color\n            value\n          }\n          maskTargetsColors {\n            intTarget\n            color\n          }\n        }\n        labelTags {\n          fieldColor\n          valueColors {\n            color\n            value\n          }\n        }\n      }\n    }\n    ...datasetFragment\n    id\n  }\n  ...NavFragment\n  ...savedViewsFragment\n  ...configFragment\n  ...stageDefinitionsFragment\n  ...viewSchemaFragment\n}\n\nfragment Analytics on Query {\n  context\n  dev\n  doNotTrack\n  uid\n  version\n}\n\nfragment NavDatasets on Query {\n  datasets(search: $search, first: $count, after: $cursor) {\n    total\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n\nfragment NavFragment on Query {\n  ...Analytics\n  ...NavDatasets\n}\n\nfragment colorSchemeFragment on ColorScheme {\n  id\n  colorBy\n  colorPool\n  multicolorKeypoints\n  opacity\n  showSkeletons\n  labelTags {\n    fieldColor\n    valueColors {\n      color\n      value\n    }\n  }\n  defaultMaskTargetsColors {\n    intTarget\n    color\n  }\n  defaultColorscale {\n    name\n    list {\n      value\n      color\n    }\n    rgb\n  }\n  colorscales {\n    path\n    name\n    list {\n      value\n      color\n    }\n    rgb\n  }\n  fields {\n    colorByAttribute\n    fieldColor\n    path\n    valueColors {\n      color\n      value\n    }\n    maskTargetsColors {\n      intTarget\n      color\n    }\n  }\n}\n\nfragment configFragment on Query {\n  config {\n    colorBy\n    colorPool\n    colorscale\n    disableFrameFiltering\n    gridZoom\n    enableQueryPerformance\n    defaultQueryPerformance\n    loopVideos\n    mediaFallback\n    multicolorKeypoints\n    notebookHeight\n    plugins\n    showConfidence\n    showIndex\n    showLabel\n    showSkeletons\n    showTooltip\n    theme\n    timezone\n    useFrameNumber\n  }\n  colorscale\n}\n\nfragment datasetAppConfigFragment on DatasetAppConfig {\n  colorScheme {\n    ...colorSchemeFragment\n    id\n  }\n  defaultVisibilityLabels {\n    include\n    exclude\n  }\n  disableFrameFiltering\n  dynamicGroupsTargetFrameRate\n  gridMediaField\n  mediaFields\n  modalMediaField\n  mediaFallback\n  plugins\n}\n\nfragment datasetFragment on Dataset {\n  createdAt\n  datasetId\n  groupField\n  id\n  info\n  lastLoadedAt\n  mediaType\n  name\n  parentMediaType\n  version\n  appConfig {\n    ...datasetAppConfigFragment\n  }\n  brainMethods {\n    key\n    version\n    timestamp\n    viewStages\n    config {\n      cls\n      embeddingsField\n      method\n      patchesField\n      supportsPrompts\n      type\n      maxK\n      supportsLeastSimilarity\n    }\n  }\n  defaultMaskTargets {\n    target\n    value\n  }\n  defaultSkeleton {\n    labels\n    edges\n  }\n  evaluations {\n    key\n    version\n    timestamp\n    viewStages\n    config {\n      cls\n      predField\n      gtField\n    }\n  }\n  groupMediaTypes {\n    name\n    mediaType\n  }\n  maskTargets {\n    name\n    targets {\n      target\n      value\n    }\n  }\n  skeletons {\n    name\n    labels\n    edges\n  }\n  ...estimatedCountsFragment\n  ...frameFieldsFragment\n  ...groupSliceFragment\n  ...indexesFragment\n  ...mediaFieldsFragment\n  ...mediaTypeFragment\n  ...sampleFieldsFragment\n  ...sidebarGroupsFragment\n  ...viewFragment\n}\n\nfragment estimatedCountsFragment on Dataset {\n  estimatedFrameCount\n  estimatedSampleCount\n}\n\nfragment frameFieldsFragment on Dataset {\n  frameFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment groupSliceFragment on Dataset {\n  defaultGroupSlice\n}\n\nfragment indexesFragment on Dataset {\n  frameIndexes {\n    name\n    unique\n    key {\n      field\n      type\n    }\n    wildcardProjection {\n      fields\n      inclusion\n    }\n  }\n  sampleIndexes {\n    name\n    unique\n    key {\n      field\n      type\n    }\n    wildcardProjection {\n      fields\n      inclusion\n    }\n  }\n}\n\nfragment mediaFieldsFragment on Dataset {\n  name\n  appConfig {\n    gridMediaField\n    mediaFields\n    modalMediaField\n    mediaFallback\n  }\n  sampleFields {\n    path\n  }\n}\n\nfragment mediaTypeFragment on Dataset {\n  mediaType\n}\n\nfragment sampleFieldsFragment on Dataset {\n  sampleFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment savedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n\nfragment sidebarGroupsFragment on Dataset {\n  datasetId\n  appConfig {\n    sidebarGroups {\n      expanded\n      paths\n      name\n    }\n  }\n  ...frameFieldsFragment\n  ...sampleFieldsFragment\n}\n\nfragment stageDefinitionsFragment on Query {\n  stageDefinitions {\n    name\n    params {\n      name\n      type\n      default\n      placeholder\n    }\n  }\n}\n\nfragment viewFragment on Dataset {\n  stages(slug: $savedViewSlug, view: $view)\n  viewCls\n  viewName\n}\n\nfragment viewSchemaFragment on Query {\n  schemaForViewStages(datasetName: $name, viewStages: $view) {\n    fieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n      info\n      description\n    }\n    frameFieldSchema {\n      path\n      ftype\n      subfield\n      embeddedDocType\n      info\n      description\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "ab62132aa2263272549c2597ae82996f";

export default node;
