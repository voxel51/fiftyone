/**
 * @generated SignedSource<<f63827e12d33257b69417dbda7f8e11e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { InlineFragment, ReaderInlineDataFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type stageDefinitionsFragment$data = {
  readonly stageDefinitions: ReadonlyArray<{
    readonly name: string;
    readonly params: ReadonlyArray<{
      readonly default: string | null;
      readonly name: string;
      readonly placeholder: string | null;
      readonly type: string;
    }>;
  }>;
  readonly " $fragmentType": "stageDefinitionsFragment";
};
export type stageDefinitionsFragment$key = {
  readonly " $data"?: stageDefinitionsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"stageDefinitionsFragment">;
};

const node: ReaderInlineDataFragment = {
  "kind": "InlineDataFragment",
  "name": "stageDefinitionsFragment"
};

(node as any).hash = "bc51364f40485e042055990a5f900da5";

export default node;
