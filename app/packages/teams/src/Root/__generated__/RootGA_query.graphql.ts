/**
 * @generated SignedSource<<ba1a7820dad8a916f82b2ab3cb41cf9d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type RootGA_query$data = {
  readonly dev: boolean;
  readonly version: string;
  readonly " $fragmentType": "RootGA_query";
};
export type RootGA_query$key = {
  readonly " $data"?: RootGA_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"RootGA_query">;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: "Fragment",
  metadata: null,
  name: "RootGA_query",
  selections: [
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "dev",
      storageKey: null,
    },
    {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "version",
      storageKey: null,
    },
  ],
  type: "Query",
  abstractKey: null,
};

(node as any).hash = "bc99ba20e333c819e2ce9b9c5b9b85c6";

export default node;
