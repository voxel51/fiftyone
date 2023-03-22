/**
 * @generated SignedSource<<17fa1a68d4a6d064c94c5966cd8cfa1f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
export type BrainRunType = "similarity" | "visualization" | "%future added value";
export type MediaType = "group" | "image" | "point_cloud" | "video" | "%future added value";
export type SidebarMode = "all" | "best" | "fast" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type datasetFragment$data = {
  readonly appConfig: {
    readonly gridMediaField: string | null;
    readonly mediaFields: ReadonlyArray<string> | null;
    readonly modalMediaField: string | null;
    readonly plugins: any | null;
    readonly sidebarMode: SidebarMode | null;
  } | null;
  readonly brainMethods: ReadonlyArray<{
    readonly config: {
      readonly cls: string;
      readonly embeddingsField: string | null;
      readonly maxK: number | null;
      readonly method: string | null;
      readonly patchesField: string | null;
      readonly supportsLeastSimilarity: boolean | null;
      readonly supportsPrompts: boolean | null;
      readonly type: BrainRunType | null;
    } | null;
    readonly key: string;
    readonly timestamp: any | null;
    readonly version: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  }> | null;
  readonly createdAt: any | null;
  readonly defaultGroupSlice: string | null;
  readonly defaultMaskTargets: ReadonlyArray<{
    readonly target: string;
    readonly value: string;
  }> | null;
  readonly defaultSkeleton: {
    readonly edges: ReadonlyArray<ReadonlyArray<number>>;
    readonly labels: ReadonlyArray<string> | null;
  } | null;
  readonly evaluations: ReadonlyArray<{
    readonly config: {
      readonly cls: string;
      readonly gtField: string | null;
      readonly predField: string | null;
    } | null;
    readonly key: string;
    readonly timestamp: any | null;
    readonly version: string | null;
    readonly viewStages: ReadonlyArray<string> | null;
  }> | null;
  readonly groupField: string | null;
  readonly groupMediaTypes: ReadonlyArray<{
    readonly mediaType: MediaType;
    readonly name: string;
  }> | null;
  readonly id: string;
  readonly info: any | null;
  readonly lastLoadedAt: any | null;
  readonly maskTargets: ReadonlyArray<{
    readonly name: string;
    readonly targets: ReadonlyArray<{
      readonly target: string;
      readonly value: string;
    }>;
  }>;
  readonly mediaType: MediaType | null;
  readonly name: string;
  readonly savedViewSlug: string | null;
  readonly skeletons: ReadonlyArray<{
    readonly edges: ReadonlyArray<ReadonlyArray<number>>;
    readonly labels: ReadonlyArray<string> | null;
    readonly name: string;
  }>;
  readonly version: string | null;
  readonly viewName: string | null;
  readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment" | "sampleFieldsFragment" | "sidebarGroupsFragment" | "viewFragment">;
  readonly " $fragmentType": "datasetFragment";
};
export type datasetFragment$key = {
  readonly " $data"?: datasetFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"datasetFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "datasetFragment"
};

(node as any).hash = "3a94150872c97f8a30d68ce80ad83efe";

export default node;
