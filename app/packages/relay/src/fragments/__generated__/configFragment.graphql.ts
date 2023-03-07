/**
 * @generated SignedSource<<dde2856234b4d98c6c84f7d95025b131>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
export type ColorBy = "field" | "instance" | "label" | "%future added value";
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
export type Theme = "browser" | "dark" | "light" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type configFragment$data = {
  readonly colorscale: ReadonlyArray<ReadonlyArray<number>> | null;
  readonly config: {
    readonly colorBy: ColorBy;
    readonly colorPool: ReadonlyArray<string>;
    readonly colorscale: string;
    readonly gridZoom: number;
    readonly loopVideos: boolean;
    readonly notebookHeight: number;
    readonly plugins: any | null;
    readonly showConfidence: boolean;
    readonly showIndex: boolean;
    readonly showLabel: boolean;
    readonly showSkeletons: boolean;
    readonly showTooltip: boolean;
    readonly sidebarMode: SidebarMode;
    readonly theme: Theme;
    readonly timezone: string | null;
    readonly useFrameNumber: boolean;
  };
  readonly " $fragmentType": "configFragment";
};
export type configFragment$key = {
  readonly " $data"?: configFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"configFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "configFragment"
};

(node as any).hash = "3e68ea93fcb891208dda7b512f65c218";

export default node;
