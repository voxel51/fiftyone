/**
 * @generated SignedSource<<c6065c85492e40edabd58aa448661cb4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type MediaType = "image" | "video" | "%future added value";
export type DatasetQuery$variables = {
  name: string;
  view?: Array | null;
};
export type DatasetQuery$data = {
  readonly colorscale: ReadonlyArray<ReadonlyArray<number>> | null;
  readonly config: {
    readonly colorPool: ReadonlyArray<string>;
    readonly colorscale: string;
    readonly gridZoom: number;
    readonly loopVideos: boolean;
    readonly notebookHeight: number;
    readonly useFrameNumber: boolean;
    readonly showConfidence: boolean;
    readonly showIndex: boolean;
    readonly showLabel: boolean;
    readonly showTooltip: boolean;
    readonly timezone: string | null;
  };
  readonly dataset: {
    readonly id: string;
    readonly name: string;
    readonly mediaType: MediaType | null;
    readonly sampleFields: ReadonlyArray<{
      readonly ftype: string;
      readonly subfield: string | null;
      readonly embeddedDocType: string | null;
      readonly path: string;
      readonly dbField: string | null;
    }>;
    readonly frameFields: ReadonlyArray<{
      readonly ftype: string;
      readonly subfield: string | null;
      readonly embeddedDocType: string | null;
      readonly path: string;
      readonly dbField: string | null;
    }>;
    readonly appSidebarGroups: ReadonlyArray<{
      readonly name: string;
      readonly paths: ReadonlyArray<string>;
    }> | null;
    readonly maskTargets: ReadonlyArray<{
      readonly name: string;
      readonly targets: ReadonlyArray<{
        readonly target: number;
        readonly value: string;
      }>;
    }>;
    readonly defaultMaskTargets: ReadonlyArray<{
      readonly target: number;
      readonly value: string;
    }> | null;
    readonly evaluations: ReadonlyArray<{
      readonly key: string;
      readonly version: string;
      readonly timestamp: string;
      readonly viewStages: ReadonlyArray<string>;
      readonly config: {
        readonly cls: string;
        readonly predField: string;
        readonly gtField: string;
      };
    }>;
    readonly brainMethods: ReadonlyArray<{
      readonly key: string;
      readonly version: string;
      readonly timestamp: string;
      readonly viewStages: ReadonlyArray<string>;
      readonly config: {
        readonly cls: string;
        readonly embeddingsField: string | null;
        readonly method: string;
        readonly patchesField: string | null;
      };
    }>;
    readonly lastLoadedAt: string;
    readonly createdAt: string;
    readonly version: string;
  };
};
export type DatasetQuery = {
  variables: DatasetQuery$variables;
  response: DatasetQuery$data;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "name"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "view"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "colorscale",
  "storageKey": null
},
v2 = {
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
      "name": "colorPool",
      "storageKey": null
    },
    (v1/*: any*/),
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
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "useFrameNumber",
      "storageKey": null
    },
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
      "name": "timezone",
      "storageKey": null
    }
  ],
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v4 = [
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
  }
],
v5 = [
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
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": [
    {
      "kind": "Variable",
      "name": "name",
      "variableName": "name"
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
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
    (v3/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaType",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "sampleFields",
      "plural": true,
      "selections": (v4/*: any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "frameFields",
      "plural": true,
      "selections": (v4/*: any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "SidebarGroup",
      "kind": "LinkedField",
      "name": "appSidebarGroups",
      "plural": true,
      "selections": [
        (v3/*: any*/),
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
      "concreteType": "NamedTargets",
      "kind": "LinkedField",
      "name": "maskTargets",
      "plural": true,
      "selections": [
        (v3/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "Target",
          "kind": "LinkedField",
          "name": "targets",
          "plural": true,
          "selections": (v5/*: any*/),
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
      "selections": (v5/*: any*/),
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
        (v6/*: any*/),
        (v7/*: any*/),
        (v8/*: any*/),
        (v9/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "EvaluationRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v10/*: any*/),
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
        (v6/*: any*/),
        (v7/*: any*/),
        (v8/*: any*/),
        (v9/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "BrainRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v10/*: any*/),
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
      "kind": "ScalarField",
      "name": "lastLoadedAt",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "createdAt",
      "storageKey": null
    },
    (v7/*: any*/)
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetQuery",
    "selections": [
      (v1/*: any*/),
      (v2/*: any*/),
      {
        "kind": "RequiredField",
        "field": (v11/*: any*/),
        "action": "THROW",
        "path": "dataset"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetQuery",
    "selections": [
      (v1/*: any*/),
      (v2/*: any*/),
      (v11/*: any*/)
    ]
  },
  "params": {
    "cacheID": "abf203da0ffdfd9623702057faa06a6f",
    "id": null,
    "metadata": {},
    "name": "DatasetQuery",
    "operationKind": "query",
    "text": "query DatasetQuery(\n  $name: String!\n  $view: JSONArray\n) {\n  colorscale\n  config {\n    colorPool\n    colorscale\n    gridZoom\n    loopVideos\n    notebookHeight\n    useFrameNumber\n    showConfidence\n    showIndex\n    showLabel\n    showTooltip\n    timezone\n  }\n  dataset(name: $name, view: $view) {\n    id\n    name\n    mediaType\n    sampleFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    frameFields {\n      ftype\n      subfield\n      embeddedDocType\n      path\n      dbField\n    }\n    appSidebarGroups {\n      name\n      paths\n    }\n    maskTargets {\n      name\n      targets {\n        target\n        value\n      }\n    }\n    defaultMaskTargets {\n      target\n      value\n    }\n    evaluations {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        predField\n        gtField\n      }\n    }\n    brainMethods {\n      key\n      version\n      timestamp\n      viewStages\n      config {\n        cls\n        embeddingsField\n        method\n        patchesField\n      }\n    }\n    lastLoadedAt\n    createdAt\n    version\n  }\n}\n"
  }
};
})();

(node as any).hash = "c3233cc1433c48dd60be9152912e43a9";

export default node;
