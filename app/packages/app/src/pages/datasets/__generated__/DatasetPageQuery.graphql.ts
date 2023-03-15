/**
 * @generated SignedSource<<34c0ee1883a4d71a2ac4ccf3b1d9da70>>
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
  } | null;
  readonly " $fragmentSpreads": FragmentRefs<"NavFragment" | "configFragment" | "datasetFragment" | "savedViewsFragment">;
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
v6 = [
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
    "variableName": "view"
  }
],
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v8 = {
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
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "defaultGroupSlice",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "groupField",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "concreteType": "Group",
  "kind": "LinkedField",
  "name": "groupMediaTypes",
  "plural": true,
  "selections": [
    (v7/*: any*/),
    (v10/*: any*/)
  ],
  "storageKey": null
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "plugins",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "sidebarMode",
  "storageKey": null
},
v16 = {
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
    (v14/*: any*/),
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
        (v7/*: any*/)
      ],
      "storageKey": null
    },
    (v15/*: any*/)
  ],
  "storageKey": null
},
v17 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "info",
  "storageKey": null
},
v19 = [
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
  (v17/*: any*/),
  (v18/*: any*/)
],
v20 = {
  "alias": null,
  "args": null,
  "concreteType": "SampleField",
  "kind": "LinkedField",
  "name": "sampleFields",
  "plural": true,
  "selections": (v19/*: any*/),
  "storageKey": null
},
v21 = {
  "alias": null,
  "args": null,
  "concreteType": "SampleField",
  "kind": "LinkedField",
  "name": "frameFields",
  "plural": true,
  "selections": (v19/*: any*/),
  "storageKey": null
},
v22 = [
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
v23 = {
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
      "selections": (v22/*: any*/),
      "storageKey": null
    }
  ],
  "storageKey": null
},
v24 = {
  "alias": null,
  "args": null,
  "concreteType": "Target",
  "kind": "LinkedField",
  "name": "defaultMaskTargets",
  "plural": true,
  "selections": (v22/*: any*/),
  "storageKey": null
},
v25 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
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
  "name": "timestamp",
  "storageKey": null
},
v28 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v29 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v30 = {
  "alias": null,
  "args": null,
  "concreteType": "EvaluationRun",
  "kind": "LinkedField",
  "name": "evaluations",
  "plural": true,
  "selections": [
    (v25/*: any*/),
    (v26/*: any*/),
    (v27/*: any*/),
    (v28/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "EvaluationRunConfig",
      "kind": "LinkedField",
      "name": "config",
      "plural": false,
      "selections": [
        (v29/*: any*/),
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
v31 = {
  "alias": null,
  "args": null,
  "concreteType": "BrainRun",
  "kind": "LinkedField",
  "name": "brainMethods",
  "plural": true,
  "selections": [
    (v25/*: any*/),
    (v26/*: any*/),
    (v27/*: any*/),
    (v28/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "BrainRunConfig",
      "kind": "LinkedField",
      "name": "config",
      "plural": false,
      "selections": [
        (v29/*: any*/),
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
        }
      ],
      "storageKey": null
    }
  ],
  "storageKey": null
},
v32 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "datasetId",
  "storageKey": null
},
v33 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
},
v34 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v35 = {
  "alias": null,
  "args": null,
  "concreteType": "SavedView",
  "kind": "LinkedField",
  "name": "savedViews",
  "plural": true,
  "selections": [
    (v9/*: any*/),
    (v32/*: any*/),
    (v7/*: any*/),
    (v33/*: any*/),
    (v17/*: any*/),
    (v34/*: any*/),
    (v28/*: any*/)
  ],
  "storageKey": null
},
v36 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v37 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v38 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v39 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
},
v40 = {
  "alias": null,
  "args": null,
  "concreteType": "NamedKeypointSkeleton",
  "kind": "LinkedField",
  "name": "skeletons",
  "plural": true,
  "selections": [
    (v7/*: any*/),
    (v38/*: any*/),
    (v39/*: any*/)
  ],
  "storageKey": null
},
v41 = {
  "alias": null,
  "args": null,
  "concreteType": "KeypointSkeleton",
  "kind": "LinkedField",
  "name": "defaultSkeleton",
  "plural": false,
  "selections": [
    (v38/*: any*/),
    (v39/*: any*/)
  ],
  "storageKey": null
},
v42 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewCls",
  "storageKey": null
},
v43 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewName",
  "storageKey": null
},
v44 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "savedViewSlug",
  "storageKey": null
},
v45 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
},
v46 = {
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
    (v45/*: any*/),
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
    (v14/*: any*/),
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
    (v15/*: any*/),
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
v47 = [
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
        "args": (v6/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v7/*: any*/)
        ],
        "storageKey": null
      },
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "NavFragment"
      },
      {
        "kind": "InlineDataFragmentSpread",
        "name": "datasetFragment",
        "selections": [
          {
            "alias": null,
            "args": (v6/*: any*/),
            "concreteType": "Dataset",
            "kind": "LinkedField",
            "name": "dataset",
            "plural": false,
            "selections": [
              (v8/*: any*/),
              (v9/*: any*/),
              (v7/*: any*/),
              (v10/*: any*/),
              (v11/*: any*/),
              (v12/*: any*/),
              (v13/*: any*/),
              (v16/*: any*/),
              (v20/*: any*/),
              (v21/*: any*/),
              (v23/*: any*/),
              (v24/*: any*/),
              (v30/*: any*/),
              (v31/*: any*/),
              (v35/*: any*/),
              (v36/*: any*/),
              (v37/*: any*/),
              (v40/*: any*/),
              (v41/*: any*/),
              (v26/*: any*/),
              (v42/*: any*/),
              (v43/*: any*/),
              (v44/*: any*/),
              (v18/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "args": null,
        "argumentDefinitions": [
          {
            "kind": "RootArgument",
            "name": "name"
          },
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
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "savedViewsFragment"
      },
      {
        "kind": "InlineDataFragmentSpread",
        "name": "configFragment",
        "selections": [
          (v46/*: any*/),
          (v45/*: any*/)
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
        "args": (v6/*: any*/),
        "concreteType": "Dataset",
        "kind": "LinkedField",
        "name": "dataset",
        "plural": false,
        "selections": [
          (v7/*: any*/),
          (v9/*: any*/),
          (v8/*: any*/),
          (v10/*: any*/),
          (v11/*: any*/),
          (v12/*: any*/),
          (v13/*: any*/),
          (v16/*: any*/),
          (v20/*: any*/),
          (v21/*: any*/),
          (v23/*: any*/),
          (v24/*: any*/),
          (v30/*: any*/),
          (v31/*: any*/),
          (v35/*: any*/),
          (v36/*: any*/),
          (v37/*: any*/),
          (v40/*: any*/),
          (v41/*: any*/),
          (v26/*: any*/),
          (v42/*: any*/),
          (v43/*: any*/),
          (v44/*: any*/),
          (v18/*: any*/)
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": (v47/*: any*/),
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
                  (v7/*: any*/),
                  (v9/*: any*/),
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
        "args": (v47/*: any*/),
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
      (v26/*: any*/),
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
          (v9/*: any*/),
          (v32/*: any*/),
          (v7/*: any*/),
          (v33/*: any*/),
          (v17/*: any*/),
          (v34/*: any*/),
          (v28/*: any*/),
          (v37/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          (v36/*: any*/)
        ],
        "storageKey": null
      },
      (v46/*: any*/),
      (v45/*: any*/)
    ]
  },
  "params": {
    "cacheID": "070db84783dab8476b0f2b7017659f8d",
    "id": null,
    "metadata": {},
    "name": "DatasetPageQuery",
    "operationKind": "query",
    "text": "query DatasetPageQuery(\n  $search: String = \"\"\n  $count: Int\n  $cursor: String\n  $savedViewSlug: String\n  $name: String!\n  $view: BSONArray\n) {\n  dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {\n    name\n    id\n  }\n  ...NavFragment\n  ...datasetFragment\n  ...savedViewsFragment\n  ...configFragment\n}\n\nfragment NavDatasets on Query {\n  datasets(search: $search, first: $count, after: $cursor) {\n    total\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n\nfragment NavFragment on Query {\n  ...NavDatasets\n  ...NavGA\n  teamsSubmission\n}\n\nfragment NavGA on Query {\n  context\n  dev\n  doNotTrack\n  uid\n  version\n}\n\nfragment configFragment on Query {\n  config {\n    colorBy\n    colorPool\n    colorscale\n    gridZoom\n    loopVideos\n    notebookHeight\n    plugins\n    showConfidence\n    showIndex\n    showLabel\n    showSkeletons\n    showTooltip\n    sidebarMode\n    theme\n    timezone\n    useFrameNumber\n  }\n  colorscale\n}\n\nfragment datasetFragment on Query {\n  dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {\n    stages(slug: $savedViewSlug)\n    id\n    name\n    mediaType\n    defaultGroupSlice\n    groupField\n    groupMediaTypes {\n      name\n      mediaType\n    }\n    appConfig {\n      gridMediaField\n      mediaFields\n      modalMediaField\n      plugins\n      sidebarGroups {\n        expanded\n        paths\n        name\n      }\n      sidebarMode\n    }\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n      description\n      info\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n      description\n      info\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n      }\n    }\n    savedViews {\n      id\n      datasetId\n      name\n      slug\n      description\n      color\n      viewStages\n    }\n    lastLoadedAt\n    createdAt\n    skeletons {\n      name\n      labels\n      edges\n    }\n    defaultSkeleton {\n      labels\n      edges\n    }\n    version\n    viewCls\n    viewName\n    savedViewSlug\n    info\n  }\n}\n\nfragment savedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "f2e9f412af4b0b828aae6409d2ece72f";

export default node;
