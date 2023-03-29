/**
 * @generated SignedSource<<3474b22b5f44ae9aa6fe05843a2aeb46>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type viewFragment$data = {
  readonly stages: Array | null;
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
