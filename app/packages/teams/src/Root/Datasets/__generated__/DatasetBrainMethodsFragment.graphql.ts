/**
 * @generated SignedSource<<d14c15b3904dbeb06fb68f92cf45c37e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetBrainMethodsFragment$data = {
  readonly config: {
    readonly embeddingsField: string | null;
    readonly method: string;
    readonly patchesField: string | null;
  };
  readonly " $fragmentSpreads": FragmentRefs<"DatasetRunFragment">;
  readonly " $fragmentType": "DatasetBrainMethodsFragment";
};
export type DatasetBrainMethodsFragment = DatasetBrainMethodsFragment$data;
export type DatasetBrainMethodsFragment$key = {
  readonly " $data"?: DatasetBrainMethodsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetBrainMethodsFragment">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "DatasetBrainMethodsFragment",
  selections: [
    {
      args: null,
      kind: "FragmentSpread",
      name: "DatasetRunFragment",
    },
    {
      alias: null,
      args: null,
      concreteType: "BrainRunConfig",
      kind: "LinkedField",
      name: "config",
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "embeddingsField",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "method",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "patchesField",
          storageKey: null,
        },
      ],
      storageKey: null,
    },
  ],
  type: "BrainRun",
  abstractKey: null,
};

(node as any).hash = "6a5e56e55cc42fef3b963a9590892cb7";

export default node;
