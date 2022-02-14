/**
 * @generated SignedSource<<1b0d627fc1e8a9fde503f8fade7be01c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type DatasetRunFragment$data = {
  readonly key: string;
  readonly version: string;
  readonly timestamp: any;
  readonly viewStages: ReadonlyArray<string>;
  readonly " $fragmentType": "DatasetRunFragment";
};
export type DatasetRunFragment = DatasetRunFragment$data;
export type DatasetRunFragment$key = {
  readonly " $data"?: DatasetRunFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetRunFragment">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "DatasetRunFragment",
  selections: [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "key",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "version",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "timestamp",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "viewStages",
      storageKey: null,
    },
  ],
  type: "Run",
  abstractKey: "__isRun",
};

(node as any).hash = "3a46cb47119af149357daffc9f520e15";

export default node;
