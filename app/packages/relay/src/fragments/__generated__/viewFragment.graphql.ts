/**
 * @generated SignedSource<<2d477a1cbd2054108d7f23ed4e9783a5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewFragment$data = {
  readonly stages: any | null;
  readonly viewCls: string | null;
  readonly viewName: string | null;
  readonly " $fragmentType": "viewFragment";
};
export type viewFragment$key = {
  readonly " $data"?: viewFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"viewFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "viewFragment"
};

(node as any).hash = "1527bc53e1cbb480f9712b02fcd0e3e2";

export default node;
