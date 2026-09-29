/**
 * @generated SignedSource<<c41f01ce30618ce70a3b0ad864d53e73>>
 * @lightSyntaxTransform
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type BrainRunType = "similarity" | "visualization" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type datasetFragment$data = {
  readonly appConfig: {
    readonly " $fragmentSpreads": FragmentRefs<"datasetAppConfigFragment">;
  } | null | undefined;
  readonly brainMethods: ReadonlyArray<{
    readonly config: {
      readonly cls: string;
      readonly embeddingsField: string | null | undefined;
      readonly maxK: number | null | undefined;
      readonly method: string | null | undefined;
      readonly model: string | null | undefined;
      readonly numDims: number | null | undefined;
      readonly patchesField: string | null | undefined;
      readonly pointsField: string | null | undefined;
      readonly supportsLeastSimilarity: boolean | null | undefined;
      readonly supportsPrompts: boolean | null | undefined;
      readonly type: BrainRunType | null | undefined;
    } | null | undefined;
    readonly error: string | null | undefined;
    readonly key: string;
    readonly ready: boolean | null | undefined;
    readonly timestamp: number | null | undefined;
    readonly version: string | null | undefined;
    readonly viewStages: ReadonlyArray<string> | null | undefined;
  }> | null | undefined;
  readonly createdAt: number | null | undefined;
  readonly datasetId: string;
  readonly defaultMaskTargets: ReadonlyArray<{
    readonly target: string;
    readonly value: string;
  }> | null | undefined;
  readonly defaultSkeleton: {
    readonly edges: ReadonlyArray<ReadonlyArray<number>>;
    readonly labels: ReadonlyArray<string> | null | undefined;
  } | null | undefined;
  readonly evaluations: ReadonlyArray<{
    readonly config: {
      readonly cls: string;
      readonly gtField: string | null | undefined;
      readonly predField: string | null | undefined;
    } | null | undefined;
    readonly key: string;
    readonly timestamp: number | null | undefined;
    readonly version: string | null | undefined;
    readonly viewStages: ReadonlyArray<string> | null | undefined;
  }> | null | undefined;
  readonly groupField: string | null | undefined;
  readonly groupMediaTypes: ReadonlyArray<{
    readonly mediaType: string;
    readonly name: string;
  }> | null | undefined;
  readonly id: string;
  readonly info: object | null | undefined;
  readonly lastLoadedAt: number | null | undefined;
  readonly maskTargets: ReadonlyArray<{
    readonly name: string;
    readonly targets: ReadonlyArray<{
      readonly target: string;
      readonly value: string;
    }>;
  }>;
  readonly mediaSources: object | null | undefined;
  readonly mediaType: string | null | undefined;
  readonly name: string;
  readonly parentMediaType: string | null | undefined;
  readonly skeletons: ReadonlyArray<{
    readonly edges: ReadonlyArray<ReadonlyArray<number>>;
    readonly labels: ReadonlyArray<string> | null | undefined;
    readonly name: string;
  }>;
  readonly version: string | null | undefined;
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
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaSources",
      "storageKey": null
    },
    (v0/*:: as any*/),
    (v1/*:: as any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "parentMediaType",
      "storageKey": null
    },
    (v2/*:: as any*/),
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
        (v3/*:: as any*/),
        (v2/*:: as any*/),
        (v4/*:: as any*/),
        (v5/*:: as any*/),
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "ready",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "error",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "BrainRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v6/*:: as any*/),
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
              "name": "numDims",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "pointsField",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "model",
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
      "selections": (v7/*:: as any*/),
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
        (v8/*:: as any*/),
        (v9/*:: as any*/)
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
        (v3/*:: as any*/),
        (v2/*:: as any*/),
        (v4/*:: as any*/),
        (v5/*:: as any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "EvaluationRunConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            (v6/*:: as any*/),
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
        (v1/*:: as any*/),
        (v0/*:: as any*/)
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
        (v1/*:: as any*/),
        {
          "alias": null,
          "args": null,
          "concreteType": "Target",
          "kind": "LinkedField",
          "name": "targets",
          "plural": true,
          "selections": (v7/*:: as any*/),
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
        (v1/*:: as any*/),
        (v8/*:: as any*/),
        (v9/*:: as any*/)
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

(node as any).hash = "ca48d00369663cf08a83df441475103c";

export default node;
