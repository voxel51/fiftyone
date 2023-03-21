/**
 * @generated SignedSource<<6709f44750bdd91c9d5bc2d8fd87e3b5>>
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
  readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment" | "sampleFieldsFragment">;
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

(node as any).hash = "5fea8ee29a267e33b6edf9e7e4f1359d";

export default node;
