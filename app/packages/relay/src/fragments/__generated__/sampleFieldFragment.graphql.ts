/**
 * @generated SignedSource<<0266d1ac19d63126a0392d8c4221aa1b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type sampleFieldFragment$data = {
  readonly dbField: string | null;
  readonly description: string | null;
  readonly embeddedDocType: string | null;
  readonly ftype: string;
  readonly info: any | null;
  readonly path: string;
  readonly subfield: string | null;
  readonly " $fragmentType": "sampleFieldFragment";
};
export type sampleFieldFragment$key = {
  readonly " $data"?: sampleFieldFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"sampleFieldFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "sampleFieldFragment"
};

(node as any).hash = "ae3f287042d840d4c95bf498f1499776";

export default node;
