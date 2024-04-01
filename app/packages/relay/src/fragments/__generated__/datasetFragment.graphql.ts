/**
 * @generated SignedSource<<a267b116905ec39254c306a1c05b32a9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type BrainRunType = "similarity" | "visualization" | "%future added value";
export type MediaType = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type datasetFragment$data = {
  readonly appConfig: {
    readonly " $fragmentSpreads": FragmentRefs<"datasetAppConfigFragment">;
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
    readonly timestamp: number | null;
    readonly version: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  }> | null;
  readonly createdAt: number | null;
  readonly datasetId: string;
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
    readonly timestamp: number | null;
    readonly version: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  }> | null;
  readonly groupField: string | null;
  readonly groupMediaTypes: ReadonlyArray<{
    readonly mediaType: MediaType;
    readonly name: string;
  }> | null;
  readonly id: string;
  readonly info: object | null;
  readonly lastLoadedAt: number | null;
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
  readonly skeletons: ReadonlyArray<{
    readonly edges: ReadonlyArray<ReadonlyArray<number>>;
    readonly labels: ReadonlyArray<string> | null;
    readonly name: string;
  }>;
  readonly version: string | null;
  readonly " $fragmentSpreads": FragmentRefs<"estimatedCountsFragment" | "frameFieldsFragment" | "groupSliceFragment" | "indexesFragment" | "mediaFieldsFragment" | "mediaTypeFragment" | "sampleFieldsFragment" | "sidebarGroupsFragment" | "viewFragment">;
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
  "name": "mediaType",
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
  "name": "version",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "key",
  "storageKey": null
},
v4 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "timestamp",
  "storageKey": null
},
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "viewStages",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "cls",
  "storageKey": null
},
v7 = [
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
v8 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "labels",
  "storageKey": null
},
v9 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "edges",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "datasetFragment",
  "selections": [
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
      "kind": "ScalarField",
      "name": "datasetId",
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
      "name": "id",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "info",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "lastLoadedAt",
      "storageKey": null
    },
    (v0/*: any*/),
    (v1/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "parentMediaType",
      "storageKey": null
    },
    (v2/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "DatasetAppConfig",
      "kind": "LinkedField",
      "name": "appConfig",
      "plural": false,
      "selections": [
        {
          "args": null,
          "kind": "FragmentSpread",
          "name": "datasetAppConfigFragment"
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
        (v3/*: any*/),
        (v2/*: any*/),
        (v4/*: any*/),
        (v5/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "BrainRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v6/*: any*/),
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
      "concreteType": "Target",
      "kind": "LinkedField",
      "name": "defaultMaskTargets",
      "plural": true,
      "selections": (v7/*: any*/),
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
        (v8/*: any*/),
        (v9/*: any*/)
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
        (v3/*: any*/),
        (v2/*: any*/),
        (v4/*: any*/),
        (v5/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "EvaluationRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v6/*: any*/),
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
        (v1/*: any*/),
        (v0/*: any*/)
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
        (v1/*: any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "Target",
          "kind": "LinkedField",
          "name": "targets",
          "plural": true,
          "selections": (v7/*: any*/),
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
        (v1/*: any*/),
        (v8/*: any*/),
        (v9/*: any*/)
      ],
      "storageKey": null
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "estimatedCountsFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "frameFieldsFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "groupSliceFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "indexesFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "mediaFieldsFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "mediaTypeFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "sampleFieldsFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "sidebarGroupsFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "viewFragment"
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};
})();

(node as any).hash = "866766401d421b021e8ff682461bb3c0";

export default node;
