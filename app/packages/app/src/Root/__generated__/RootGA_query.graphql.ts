/**
 * @generated SignedSource<<72c3a0dc7d2ffb2bbaf81c43908cbd27>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type RootGA_query$data = {
  readonly context: string;
  readonly dev: boolean;
  readonly doNotTrack: boolean;
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
      name: "context",
      storageKey: null,
    },
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
      name: "doNotTrack",
      storageKey: null,
    },
  ],
  type: "Query",
  abstractKey: null,
};

(node as any).hash = "1c077e1defed26f2efb4dc50794f436b";

export default node;
