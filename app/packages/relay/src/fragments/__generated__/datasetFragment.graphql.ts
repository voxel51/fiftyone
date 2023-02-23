/**
 * @generated SignedSource<<87d358cd1ee34e4af7e94b526dd7a738>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type MediaType = "group" | "image" | "point_cloud" | "video" | "%future added value";
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type datasetFragment$data = {
  readonly dataset: {
    readonly appConfig: {
      readonly gridMediaField: string | null;
      readonly mediaFields: ReadonlyArray<string> | null;
      readonly modalMediaField: string | null;
      readonly plugins: any | null;
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
      readonly info: any | null;
      readonly path: string;
      readonly subfield: string | null;
    }> | null;
    readonly groupField: string | null;
    readonly groupMediaTypes: ReadonlyArray<{
      readonly mediaType: MediaType;
      readonly name: string;
    }> | null;
    readonly id: string;
    readonly info: any | null;
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
      readonly info: any | null;
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
    readonly stages: any | null;
    readonly version: string | null;
    readonly viewCls: string | null;
    readonly viewName: string | null;
  } | null;
  readonly " $fragmentType": "datasetFragment";
};
export type datasetFragment$key = {
  readonly " $data"?: datasetFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"datasetFragment">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "mediaType",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "info",
  "storageKey": null
},
v5 = [
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
  (v3/*: any*/),
  (v4/*: any*/)
],
v6 = [
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
v7 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "version",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v10 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v11 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v12 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v13 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
};
return {
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
  ],
  "kind": "Fragment",
  "metadata": null,
  "name": "datasetFragment",
  "selections": [
    {
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
        (v0/*: any*/),
        (v1/*: any*/),
        (v2/*: any*/),
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
            (v1/*: any*/),
            (v2/*: any*/)
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
                (v1/*: any*/)
              ],
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
          "selections": (v5/*: any*/),
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "SampleField",
          "kind": "LinkedField",
          "name": "frameFields",
          "plural": true,
          "selections": (v5/*: any*/),
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
            (v1/*: any*/),
            {
              "alias": null,
              "args": null,
              "concreteType": "Target",
              "kind": "LinkedField",
              "name": "targets",
              "plural": true,
              "selections": (v6/*: any*/),
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
          "selections": (v6/*: any*/),
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
            (v7/*: any*/),
            (v8/*: any*/),
            (v9/*: any*/),
            (v10/*: any*/),
            {
              "alias": null,
              "args": null,
              "concreteType": "EvaluationRunConfig",
              "kind": "LinkedField",
              "name": "config",
              "plural": false,
              "selections": [
                (v11/*: any*/),
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
            (v7/*: any*/),
            (v8/*: any*/),
            (v9/*: any*/),
            (v10/*: any*/),
            {
              "alias": null,
              "args": null,
              "concreteType": "BrainRunConfig",
              "kind": "LinkedField",
              "name": "config",
              "plural": false,
              "selections": [
                (v11/*: any*/),
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
            (v0/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "datasetId",
              "storageKey": null
            },
            (v1/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "slug",
              "storageKey": null
            },
            (v3/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "color",
              "storageKey": null
            },
            (v10/*: any*/)
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
        {
          "alias": null,
          "args": null,
          "concreteType": "NamedKeypointSkeleton",
          "kind": "LinkedField",
          "name": "skeletons",
          "plural": true,
          "selections": [
            (v1/*: any*/),
            (v12/*: any*/),
            (v13/*: any*/)
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
            (v12/*: any*/),
            (v13/*: any*/)
          ],
          "storageKey": null
        },
        (v8/*: any*/),
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
        (v4/*: any*/)
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};
})();

(node as any).hash = "9ca3e65adfe2c8f1a72c44ddcf7cbb10";

export default node;
