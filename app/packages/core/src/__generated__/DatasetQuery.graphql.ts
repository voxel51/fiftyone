/**
 * @generated SignedSource<<0709206ef784e0212c6b95d8c4c6340f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
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
  "name": "description",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "info",
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
  (v6/*: any*/),
  (v7/*: any*/)
],
v9 = [
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
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v14 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v15 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "datasetId",
  "storageKey": null
},
v16 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
},
v17 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "color",
  "storageKey": null
},
v18 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "lastLoadedAt",
  "storageKey": null
},
v19 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "createdAt",
  "storageKey": null
},
v20 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v21 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
},
v22 = {
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
          "name": "modalMediaField",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "sidebarMode",
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
      "selections": (v8/*: any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "frameFields",
      "plural": true,
      "selections": (v8/*: any*/),
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
          "selections": (v9/*: any*/),
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
      "selections": (v9/*: any*/),
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
        (v10/*: any*/),
        (v11/*: any*/),
        (v12/*: any*/),
        (v13/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "EvaluationRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v14/*: any*/),
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
        (v10/*: any*/),
        (v11/*: any*/),
        (v12/*: any*/),
        (v13/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "BrainRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v14/*: any*/),
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
    {
      "alias": null,
      "args": null,
      "concreteType": "SavedView",
      "kind": "LinkedField",
      "name": "savedViews",
      "plural": true,
      "selections": [
        (v3/*: any*/),
        (v15/*: any*/),
        (v4/*: any*/),
        (v16/*: any*/),
        (v6/*: any*/),
        (v17/*: any*/),
        (v13/*: any*/)
      ],
      "storageKey": null
    },
    (v18/*: any*/),
    (v19/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "NamedKeypointSkeleton",
      "kind": "LinkedField",
      "name": "skeletons",
      "plural": true,
      "selections": [
        (v4/*: any*/),
        (v20/*: any*/),
        (v21/*: any*/)
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
        (v20/*: any*/),
        (v21/*: any*/)
      ],
      "storageKey": null
    },
    (v11/*: any*/),
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
    (v7/*: any*/)
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
      (v22/*: any*/)
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
          (v15/*: any*/),
          (v4/*: any*/),
          (v16/*: any*/),
          (v6/*: any*/),
          (v17/*: any*/),
          (v13/*: any*/),
          (v19/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "lastModifiedAt",
            "storageKey": null
          },
          (v18/*: any*/)
        ],
        "storageKey": null
      },
      (v22/*: any*/)
    ]
  },
  "params": {
    "cacheID": "39f006367f0dc953802371927acf584e",
    "id": null,
    "metadata": {},
    "name": "DatasetQuery",
    "operationKind": "query",
    "text": "query DatasetQuery(\n  $name: String!\n  $view: BSONArray = null\n  $savedViewSlug: String = null\n) {\n  ...DatasetSavedViewsFragment\n  dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {\n    stages(slug: $savedViewSlug)\n    id\n    name\n    mediaType\n    defaultGroupSlice\n    groupField\n    groupMediaTypes {\n      name\n      mediaType\n    }\n    appConfig {\n      gridMediaField\n      mediaFields\n      plugins\n      sidebarGroups {\n        expanded\n        paths\n        name\n      }\n      modalMediaField\n      sidebarMode\n    }\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n      description\n      info\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n      description\n      info\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n      }\n    }\n    savedViews {\n      id\n      datasetId\n      name\n      slug\n      description\n      color\n      viewStages\n    }\n    lastLoadedAt\n    createdAt\n    skeletons {\n      name\n      labels\n      edges\n    }\n    defaultSkeleton {\n      labels\n      edges\n    }\n    version\n    viewCls\n    viewName\n    savedViewSlug\n    info\n  }\n}\n\nfragment DatasetSavedViewsFragment on Query {\n  savedViews(datasetName: $name) {\n    id\n    datasetId\n    name\n    slug\n    description\n    color\n    viewStages\n    createdAt\n    lastModifiedAt\n    lastLoadedAt\n  }\n}\n"
  }
};
})();

(node as any).hash = "2b2283f0daec314e6ccef0931d793ae5";

export default node;
