/**
 * @generated SignedSource<<373eab75528f42e461ef1d005580f4f7>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type sampleFieldsFragment$data = {
  readonly sampleFields: ReadonlyArray<{
    readonly dbField: string | null;
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: any | null;
    readonly path: string;
    readonly subfield: string | null;
  }>;
  readonly " $fragmentType": "sampleFieldsFragment";
};
export type sampleFieldsFragment$key = {
  readonly " $data"?: sampleFieldsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"sampleFieldsFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "sampleFieldsFragment"
};

(node as any).hash = "e3cd4af61595d17cea0f0063722d4c15";

export default node;
