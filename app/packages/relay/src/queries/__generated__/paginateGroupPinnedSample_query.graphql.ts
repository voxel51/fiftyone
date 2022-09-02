/**
 * @generated SignedSource<<91d2e992d99ca5af6a6d53825dfab9c8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type paginateGroupPinnedSample_query$data = {
  readonly sample:
    | {
        readonly __typename: "ImageSample";
        readonly aspectRatio: number;
        readonly sample: object;
      }
    | {
        readonly __typename: "PointCloudSample";
        readonly sample: object;
      }
    | {
        readonly __typename: "VideoSample";
        readonly aspectRatio: number;
        readonly frameRate: number;
        readonly sample: object;
      }
    | {
        // This will never be '%other', but we need some
        // value in case none of the concrete values match.
        readonly __typename: "%other";
      }
    | null;
  readonly " $fragmentType": "paginateGroupPinnedSample_query";
};
export type paginateGroupPinnedSample_query$key = {
  readonly " $data"?: paginateGroupPinnedSample_query$data;
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroupPinnedSample_query">;
};

const node: ReaderInlineDataFragment = {
  kind: "InlineDataFragment",
  name: "paginateGroupPinnedSample_query",
};

(node as any).hash = "eb9c0c15bffcff12cd9a2174a2671591";

export default node;
