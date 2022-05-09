/**
 * @generated SignedSource<<081d9b5484cd54cbbbbc398be2d9ca7a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type RootDatasets_dataset$data = {
  readonly name: string;
  readonly " $fragmentType": "RootDatasets_dataset";
};
export type RootDatasets_dataset = RootDatasets_dataset$data;
export type RootDatasets_dataset$key = {
  readonly " $data"?: RootDatasets_dataset$data;
  readonly " $fragmentSpreads": FragmentRefs<"RootDatasets_dataset">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "RootDatasets_dataset",
  selections: [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "name",
      storageKey: null,
    },
  ],
  type: "Dataset",
  abstractKey: null,
};

(node as any).hash = "133e3905145f47afbba81d309d2d76ec";

export default node;
