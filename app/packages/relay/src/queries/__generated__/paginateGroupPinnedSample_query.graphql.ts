/**
 * @generated SignedSource<<43d1f4a2f971892fbf9c0f689d1eb09f>>
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
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string;
        }>;
      }
    | {
        readonly __typename: "PointCloudSample";
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string;
        }>;
      }
    | {
        readonly __typename: "VideoSample";
        readonly aspectRatio: number;
        readonly frameRate: number;
        readonly sample: object;
        readonly urls: ReadonlyArray<{
          readonly field: string;
          readonly url: string;
        }>;
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

(node as any).hash = "16b25b90dbfe503845cc0c8ee882e636";

export default node;
