/**
 * @generated SignedSource<<af74b01ffced0e97291230c30c8eff4b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type frameFieldsFragment$data = {
  readonly frameFields: ReadonlyArray<{
    readonly dbField: string | null;
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: any | null;
    readonly path: string;
    readonly subfield: string | null;
  }> | null;
  readonly " $fragmentType": "frameFieldsFragment";
};
export type frameFieldsFragment$key = {
  readonly " $data"?: frameFieldsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "frameFieldsFragment"
};

(node as any).hash = "00c9435f28789a50c174ba7e463a0be6";

export default node;
