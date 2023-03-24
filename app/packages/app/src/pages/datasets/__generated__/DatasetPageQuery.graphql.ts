/**
 * @generated SignedSource<<0fb2dbd9f1aba1144f43681f376709a2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetPageQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  name: string;
  savedViewSlug?: string | null;
  search?: string | null;
  view?: any | null;
};
export type DatasetPageQuery$data = {
  readonly dataset: {
    readonly name: string;
    readonly " $fragmentSpreads": FragmentRefs<"datasetFragment">;
  };
  readonly " $fragmentSpreads": FragmentRefs<"NavFragment" | "configFragment" | "savedViewsFragment" | "stageDefinitionsFragment">;
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
  "name": "name"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "savedViewSlug"
},
v4 = {
  "defaultValue": "",
  "kind": "LocalArgument",
  "name": "search"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v6 = {
  "kind": "Variable",
  "name": "view",
  "variableName": "view"
},
v7 = [
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
  (v6/*: any*/)
],
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "info",
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
  (v9/*: any*/),
  (v10/*: any*/)
],
v12 = {
  "alias": null,
  "args": null,
  "concreteType": "SampleField",
  "kind": "LinkedField",
  "name": "frameFields",
  "plural": true,
  "selections": (v11/*: any*/),
  "storageKey": null
},
v13 = {
  "kind": "InlineDataFragmentSpread",
  "name": "frameFieldsFragment",
  "selections": [
    (v12/*: any*/)
  ],
  "args": null,
  "argumentDefinitions": ([]/*: any*/)
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "groupSlice",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "concreteType": "SampleField",
  "kind": "LinkedField",
  "name": "sampleFields",
  "plural": true,
  "selections": (v11/*: any*/),
  "storageKey": null
},
v16 = {
  "kind": "InlineDataFragmentSpread",
  "name": "sampleFieldsFragment",
  "selections": [
    (v15/*: any*/)
  ],
  "args": null,
  "argumentDefinitions": ([]/*: any*/)
},
v17 = {
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
    (v8/*: any*/)
  ],
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": [
    {
      "kind": "Variable",
      "name": "slug",
      "variableName": "savedViewSlug"
    },
    (v6/*: any*/)
  ],
  "kind": "ScalarField",
  "name": "stages",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewCls",
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewName",
  "storageKey": null
},
v21 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v22 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v23 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "groupField",
  "storageKey": null
},
v24 = {
  "alias": null,
  "args": null,
  "concreteType": "Group",
  "kind": "LinkedField",
  "name": "groupMediaTypes",
  "plural": true,
  "selections": [
    (v8/*: any*/),
    (v22/*: any*/)
  ],
  "storageKey": null
},
v25 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "gridMediaField",
  "storageKey": null
},
v26 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaFields",
  "storageKey": null
},
v27 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "modalMediaField",
  "storageKey": null
},
v28 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "plugins",
  "storageKey": null
},
v29 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sidebarMode",
  "storageKey": null
},
v30 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "target",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "value",
    "storageKey": null
  }
],
v31 = {
  "alias": null,
  "args": null,
  "concreteType": "NamedTargets",
  "kind": "LinkedField",
  "name": "maskTargets",
  "plural": true,
  "selections": [
    (v8/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "Target",
      "kind": "LinkedField",
      "name": "targets",
      "plural": true,
      "selections": (v30/*: any*/),
      "storageKey": null
    }
  ],
  "storageKey": null
},
v32 = {
  "alias": null,
  "args": null,
  "concreteType": "Target",
  "kind": "LinkedField",
  "name": "defaultMaskTargets",
  "plural": true,
  "selections": (v30/*: any*/),
  "storageKey": null
},
v33 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v34 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
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
  "concreteType": "EvaluationRun",
  "kind": "LinkedField",
  "name": "evaluations",
  "plural": true,
  "selections": [
    (v33/*: any*/),
    (v34/*: any*/),
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
v39 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "type",
  "storageKey": null
},
v40 = {
  "alias": null,
  "args": null,
  "concreteType": "BrainRun",
  "kind": "LinkedField",
  "name": "brainMethods",
  "plural": true,
  "selections": [
    (v33/*: any*/),
    (v34/*: any*/),
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
        (v39/*: any*/),
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
v41 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v42 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v43 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v44 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
},
v45 = {
  "alias": null,
  "args": null,
  "concreteType": "NamedKeypointSkeleton",
  "kind": "LinkedField",
  "name": "skeletons",
  "plural": true,
  "selections": [
    (v8/*: any*/),
    (v43/*: any*/),
    (v44/*: any*/)
  ],
  "storageKey": null
},
v46 = {
  "alias": null,
  "args": null,
  "concreteType": "KeypointSkeleton",
  "kind": "LinkedField",
  "name": "defaultSkeleton",
  "plural": false,
  "selections": [
    (v43/*: any*/),
    (v44/*: any*/)
  ],
  "storageKey": null
},
v47 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
},
v48 = {
  "alias": null,
  "args": null,
  "concreteType": "AppConfig",
  "kind": "LinkedField",
  "name": "config",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "colorBy",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "colorPool",
      "storageKey": null
    },
    (v47/*: any*/),
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
    (v28/*: any*/),
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
      "name": "showSkeletons",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "showTooltip",
      "storageKey": null
    },
    (v29/*: any*/),
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
v49 = {
  "alias": null,
  "args": null,
  "concreteType": "StageDefinition",
  "kind": "LinkedField",
  "name": "stageDefinitions",
  "plural": true,
  "selections": [
    (v8/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "StageParameter",
      "kind": "LinkedField",
      "name": "params",
      "plural": true,
      "selections": [
        (v8/*: any*/),
        (v39/*: any*/),
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
v50 = [
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
    "name": "DatasetPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v7/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v8/*: any*/),
          {
            "kind": "InlineDataFragmentSpread",
            "name": "datasetFragment",
            "selections": [
              (v13/*: any*/),
              {
                "kind": "InlineDataFragmentSpread",
                "name": "groupSliceFragment",
                "selections": [
                  (v14/*: any*/)
                ],
                "args": null,
                "argumentDefinitions": []
              },
              (v16/*: any*/),
              {
                "kind": "InlineDataFragmentSpread",
                "name": "sidebarGroupsFragment",
                "selections": [
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
                  (v13/*: any*/),
                  (v16/*: any*/)
                ],
                "args": null,
                "argumentDefinitions": []
              },
              {
                "kind": "InlineDataFragmentSpread",
                "name": "viewFragment",
                "selections": [
                  (v18/*: any*/),
                  (v19/*: any*/),
                  (v20/*: any*/)
                ],
                "args": null,
                "argumentDefinitions": [
                  {
                    "kind": "RootArgument",
                    "name": "savedViewSlug"
                  },
                  {
                    "kind": "RootArgument",
                    "name": "view"
                  }
                ]
              },
              (v21/*: any*/),
              (v8/*: any*/),
              (v22/*: any*/),
              (v23/*: any*/),
              (v24/*: any*/),
              {
                "alias": null,
                "args": null,
                "concreteType": "DatasetAppConfig",
                "kind": "LinkedField",
                "name": "appConfig",
                "plural": false,
                "selections": [
                  (v25/*: any*/),
                  (v26/*: any*/),
                  (v27/*: any*/),
                  (v28/*: any*/),
                  (v29/*: any*/)
                ],
                "storageKey": null
              },
              (v31/*: any*/),
              (v32/*: any*/),
              (v38/*: any*/),
              (v40/*: any*/),
              (v41/*: any*/),
              (v42/*: any*/),
              (v45/*: any*/),
              (v46/*: any*/),
              (v34/*: any*/),
              (v10/*: any*/)
            ],
            "args": null,
            "argumentDefinitions": []
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
        "kind": "InlineDataFragmentSpread",
        "name": "configFragment",
        "selections": [
          (v48/*: any*/),
          (v47/*: any*/)
        ],
        "args": null,
        "argumentDefinitions": []
      },
      {
        "kind": "InlineDataFragmentSpread",
        "name": "stageDefinitionsFragment",
        "selections": [
          (v49/*: any*/)
        ],
        "args": null,
        "argumentDefinitions": []
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v4/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/),
      (v5/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetPageQuery",
    "selections": [
      {
        "alias": null,
        "args": (v7/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v8/*: any*/),
          (v12/*: any*/),
          (v14/*: any*/),
          (v15/*: any*/),
          {
            "alias": null,
            "args": null,
            "concreteType": "DatasetAppConfig",
            "kind": "LinkedField",
            "name": "appConfig",
            "plural": false,
            "selections": [
              (v17/*: any*/),
              (v25/*: any*/),
              (v26/*: any*/),
              (v27/*: any*/),
              (v28/*: any*/),
              (v29/*: any*/)
            ],
            "storageKey": null
          },
          (v18/*: any*/),
          (v19/*: any*/),
          (v20/*: any*/),
          (v21/*: any*/),
          (v22/*: any*/),
          (v23/*: any*/),
          (v24/*: any*/),
          (v31/*: any*/),
          (v32/*: any*/),
          (v38/*: any*/),
          (v40/*: any*/),
          (v41/*: any*/),
          (v42/*: any*/),
          (v45/*: any*/),
          (v46/*: any*/),
          (v34/*: any*/),
          (v10/*: any*/)
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": (v50/*: any*/),
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
                  (v8/*: any*/),
                  (v21/*: any*/),
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
        "args": (v50/*: any*/),
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
      (v34/*: any*/),
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "teamsSubmission",
        "storageKey": null
      },
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "datasetName",
            "variableName": "name"
          }
        ],
        "concreteType": "SavedView",
        "kind": "LinkedField",
        "name": "savedViews",
        "plural": true,
        "selections": [
          (v21/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "datasetId",
            "storageKey": null
          },
          (v8/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "slug",
            "storageKey": null
          },
          (v9/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "color",
            "storageKey": null
          },
          (v36/*: any*/),
          (v42/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          (v41/*: any*/)
        ],
        "storageKey": null
      },
      (v48/*: any*/),
      (v47/*: any*/),
      (v49/*: any*/)
    ]
  },
  "params": {
    "cacheID": "7f3d0e7d67f7325b799684fa971f3f67",
    "id": null,
    "metadata": {},
    "name": "DatasetPageQuery",
    "operationKind": "query",
    "text": "query DatasetPageQuery(\n  $search: String = \"\"\n  $count: Int\n  $cursor: String\n  $savedViewSlug: String\n  $name: String!\n  $view: BSONArray\n) {\n  dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {\n    name\n    ...datasetFragment\n    id\n  }\n  ...NavFragment\n  ...savedViewsFragment\n  ...configFragment\n  ...stageDefinitionsFragment\n}\n\nfragment NavDatasets on Query {\n  datasets(search: $search, first: $count, after: $cursor) {\n    total\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n\nfragment NavFragment on Query {\n  ...NavDatasets\n  ...NavGA\n  teamsSubmission\n}\n\nfragment NavGA on Query {\n  context\n  dev\n  doNotTrack\n  uid\n  version\n}\n\nfragment configFragment on Query {\n  config {\n    colorBy\n    colorPool\n    colorscale\n    gridZoom\n    loopVideos\n    notebookHeight\n    plugins\n    showConfidence\n    showIndex\n    showLabel\n    showSkeletons\n    showTooltip\n    sidebarMode\n    theme\n    timezone\n    useFrameNumber\n  }\n  colorscale\n}\n\nfragment datasetFragment on Dataset {\n  ...frameFieldsFragment\n  ...groupSliceFragment\n  ...sampleFieldsFragment\n  ...sidebarGroupsFragment\n  ...viewFragment\n  id\n  name\n  mediaType\n  groupField\n  groupMediaTypes {\n    name\n    mediaType\n  }\n  appConfig {\n    gridMediaField\n    mediaFields\n    modalMediaField\n    plugins\n    sidebarMode\n  }\n  maskTargets {\n    name\n    targets {\n      target\n      value\n    }\n  }\n  defaultMaskTargets {\n    target\n    value\n  }\n  evaluations {\n    key\n    version\n    timestamp\n    viewStages\n    config {\n      cls\n      predField\n      gtField\n    }\n  }\n  brainMethods {\n    key\n    version\n    timestamp\n    viewStages\n    config {\n      cls\n      embeddingsField\n      method\n      patchesField\n      supportsPrompts\n      type\n      maxK\n      supportsLeastSimilarity\n    }\n  }\n  lastLoadedAt\n  createdAt\n  skeletons {\n    name\n    labels\n    edges\n  }\n  defaultSkeleton {\n    labels\n    edges\n  }\n  version\n  info\n}\n\nfragment frameFieldsFragment on Dataset {\n  frameFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment groupSliceFragment on Dataset {\n  groupSlice\n}\n\nfragment sampleFieldsFragment on Dataset {\n  sampleFields {\n    ftype\n    subfield\n    embeddedDocType\n    path\n    dbField\n    description\n    info\n  }\n}\n\nfragment savedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n\nfragment sidebarGroupsFragment on Dataset {\n  appConfig {\n    sidebarGroups {\n      expanded\n      paths\n      name\n    }\n  }\n  ...frameFieldsFragment\n  ...sampleFieldsFragment\n}\n\nfragment stageDefinitionsFragment on Query {\n  stageDefinitions {\n    name\n    params {\n      name\n      type\n      default\n      placeholder\n    }\n  }\n}\n\nfragment viewFragment on Dataset {\n  stages(slug: $savedViewSlug, view: $view)\n  viewCls\n  viewName\n}\n"
  }
};
})();

(node as any).hash = "c7c446bd6b161d451dd1700590b56c23";

export default node;
