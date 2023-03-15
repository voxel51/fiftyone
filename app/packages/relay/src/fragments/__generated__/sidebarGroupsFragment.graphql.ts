/**
 * @generated SignedSource<<35c6a1bad1666bbde7248987fafc921c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type sidebarGroupsFragment$data = {
  readonly appConfig: {
    readonly sidebarGroups: ReadonlyArray<{
      readonly expanded: boolean | null;
      readonly name: string;
      readonly paths: ReadonlyArray<string> | null;
    }> | null;
  } | null;
  readonly frameFields: ReadonlyArray<{
    readonly dbField: string | null;
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: any | null;
    readonly path: string;
    readonly subfield: string | null;
  }> | null;
  readonly sampleFields: ReadonlyArray<{
    readonly dbField: string | null;
    readonly description: string | null;
    readonly embeddedDocType: string | null;
    readonly ftype: string;
    readonly info: any | null;
    readonly path: string;
    readonly subfield: string | null;
  }>;
  readonly " $fragmentType": "sidebarGroupsFragment";
};
export type sidebarGroupsFragment$key = {
  readonly " $data"?: sidebarGroupsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"sidebarGroupsFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "sidebarGroupsFragment"
};

(node as any).hash = "4f071de619c9112ac2e811bab5c0af91";

export default node;
