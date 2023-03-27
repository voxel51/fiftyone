/**
 * @generated SignedSource<<a97697b73e0d1be523b9168584072617>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
export type MediaType = "group" | "image" | "point_cloud" | "video" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type mediaTypeFragment$data = {
  readonly mediaType: MediaType | null;
  readonly " $fragmentType": "mediaTypeFragment";
};
export type mediaTypeFragment$key = {
  readonly " $data"?: mediaTypeFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"mediaTypeFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "mediaTypeFragment"
};

(node as any).hash = "df3111d45bf90184ac38ac1110429992";

export default node;
