/**
 * @generated SignedSource<<329eb56a87eb72e7f7a8e00ff13c8d81>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type BrainRunType = "similarity" | "visualization" | "%future added value";
export type MediaType = "group" | "image" | "point_cloud" | "video" | "%future added value";
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
export type DatasetQuery$variables = {
  name: string;
  savedViewSlug?: string | null;
  view?: Array | null;
};
export type DatasetQuery$data = {
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
        readonly maxK: number | null;
        readonly method: string | null;
        readonly patchesField: string | null;
        readonly supportsLeastSimilarity: boolean | null;
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
    readonly info: object | null;
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
    readonly savedViewSlug: string | null;
    readonly savedViews: ReadonlyArray<{
      readonly color: string | null;
      readonly datasetId: string | null;
      readonly description: string | null;
      readonly id: string | null;
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
  } | null;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetSavedViewsFragment">;
};
export type DatasetQuery = {
  response: DatasetQuery$data;
  variables: DatasetQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "savedViewSlug"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "view"
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "path",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "value",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
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
  (v6/*: any*/),
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
v12 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "target",
    "storageKey": null
  },
  (v7/*: any*/)
],
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v17 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "datasetId",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
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
v24 = {
  "alias": null,
  "args": [
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
  "concreteType": "Dataset",
  "kind": "LinkedField",
  "name": "dataset",
  "plural": false,
  "selections": [
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
    (v3/*: any*/),
    (v4/*: any*/),
    (v5/*: any*/),
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
      "kind": "ScalarField",
      "name": "groupSlice",
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
        (v4/*: any*/),
        (v5/*: any*/)
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
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "paths",
              "storageKey": null
            },
            (v4/*: any*/)
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
                (v6/*: any*/),
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
                    (v7/*: any*/),
                    (v8/*: any*/)
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
        (v4/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "Target",
          "kind": "LinkedField",
          "name": "targets",
          "plural": true,
          "selections": (v12/*: any*/),
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
      "selections": (v12/*: any*/),
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
        (v13/*: any*/),
        (v14/*: any*/),
        (v15/*: any*/),
        (v16/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "EvaluationRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v17/*: any*/),
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
        (v13/*: any*/),
        (v14/*: any*/),
        (v15/*: any*/),
        (v16/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "BrainRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v17/*: any*/),
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
            },
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
      "concreteType": "SavedView",
      "kind": "LinkedField",
      "name": "savedViews",
      "plural": true,
      "selections": [
        (v3/*: any*/),
        (v18/*: any*/),
        (v4/*: any*/),
        (v19/*: any*/),
        (v9/*: any*/),
        (v8/*: any*/),
        (v16/*: any*/)
      ],
      "storageKey": null
    },
    (v20/*: any*/),
    (v21/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "NamedKeypointSkeleton",
      "kind": "LinkedField",
      "name": "skeletons",
      "plural": true,
      "selections": [
        (v4/*: any*/),
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
    (v14/*: any*/),
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
      "kind": "ScalarField",
      "name": "savedViewSlug",
      "storageKey": null
    },
    (v10/*: any*/)
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "DatasetSavedViewsFragment"
      },
      (v24/*: any*/)
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetQuery",
    "selections": [
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
          (v3/*: any*/),
          (v18/*: any*/),
          (v4/*: any*/),
          (v19/*: any*/),
          (v9/*: any*/),
          (v8/*: any*/),
          (v16/*: any*/),
          (v21/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          (v20/*: any*/)
        ],
        "storageKey": null
      },
      (v24/*: any*/)
    ]
  },
  "params": {
    "cacheID": "a2703fa8eea22483f8e72326805e0c07",
    "id": null,
    "metadata": {},
    "name": "DatasetQuery",
    "operationKind": "query",
    "text": "query DatasetQuery(\n  $name: String!\n  $view: BSONArray = null\n  $savedViewSlug: String = null\n) {\n  ...DatasetSavedViewsFragment\n  dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {\n    stages(slug: $savedViewSlug)\n    id\n    name\n    mediaType\n    parentMediaType\n    defaultGroupSlice\n    groupField\n    groupSlice\n    groupMediaTypes {\n      name\n      mediaType\n    }\n    appConfig {\n      gridMediaField\n      mediaFields\n      modalMediaField\n      plugins\n      sidebarGroups {\n        expanded\n        paths\n        name\n      }\n      sidebarMode\n      colorScheme {\n        colorPool\n        fields {\n          path\n          fieldColor\n          colorByAttribute\n          valueColors {\n            value\n            color\n          }\n        }\n      }\n    }\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n      description\n      info\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n      description\n      info\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n        supportsPrompts\n        type\n        maxK\n        supportsLeastSimilarity\n      }\n    }\n    savedViews {\n      id\n      datasetId\n      name\n      slug\n      description\n      color\n      viewStages\n    }\n    lastLoadedAt\n    createdAt\n    skeletons {\n      name\n      labels\n      edges\n    }\n    defaultSkeleton {\n      labels\n      edges\n    }\n    version\n    viewCls\n    viewName\n    savedViewSlug\n    info\n  }\n}\n\nfragment DatasetSavedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "8a46d51e02f38f3de33f7779a40c16a0";

export default node;
