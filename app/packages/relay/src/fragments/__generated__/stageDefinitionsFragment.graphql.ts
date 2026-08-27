/**
 * @generated SignedSource<<6c9f5c6b159cf41a51a3b7c4211b89a8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type StageParameterChoiceSource = "CONSTANTS" | "EVALUATION_KEYS" | "FIELDS" | "FREE_TEXT" | "GROUP_SLICES" | "SIMILARITY_KEYS" | "%future added value";
export type StageParameterFieldExistence = "ANY" | "EXISTING" | "EXISTING_ROOT" | "%future added value";
export type StageParameterFieldLevel = "ANY" | "FRAME" | "SAMPLE" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type stageDefinitionsFragment$data = {
  readonly stageDefinitions: ReadonlyArray<{
    readonly description: string | null;
    readonly mediaTypes: ReadonlyArray<string>;
    readonly name: string;
    readonly params: ReadonlyArray<{
      readonly choices: {
        readonly fields: ReadonlyArray<{
          readonly existence: StageParameterFieldExistence;
          readonly ftypes: ReadonlyArray<string>;
          readonly labelTypes: ReadonlyArray<string>;
          readonly level: StageParameterFieldLevel;
        }>;
        readonly source: StageParameterChoiceSource;
        readonly values: ReadonlyArray<string>;
      };
      readonly default: string | null;
      readonly name: string;
      readonly nullable: boolean;
      readonly placeholder: string | null;
      readonly required: boolean;
      readonly tokens: ReadonlyArray<string>;
      readonly type: string;
    }>;
  }>;
  readonly " $fragmentType": "stageDefinitionsFragment";
};
export type stageDefinitionsFragment$key = {
  readonly " $data"?: stageDefinitionsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"stageDefinitionsFragment">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "stageDefinitionsFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "StageDefinition",
      "kind": "LinkedField",
      "name": "stageDefinitions",
      "plural": true,
      "selections": [
        (v0/*: any*/),
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "description",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "mediaTypes",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "StageParameter",
          "kind": "LinkedField",
          "name": "params",
          "plural": true,
          "selections": [
            (v0/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "type",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "tokens",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "nullable",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "required",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "default",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "placeholder",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "concreteType": "StageParameterChoices",
              "kind": "LinkedField",
              "name": "choices",
              "plural": false,
              "selections": [
                {
                  "alias": null,
                  "args": null,
                  "kind": "ScalarField",
                  "name": "source",
                  "storageKey": null
                },
                {
                  "alias": null,
                  "args": null,
                  "kind": "ScalarField",
                  "name": "values",
                  "storageKey": null
                },
                {
                  "alias": null,
                  "args": null,
                  "concreteType": "StageParameterFieldConstraint",
                  "kind": "LinkedField",
                  "name": "fields",
                  "plural": true,
                  "selections": [
                    {
                      "alias": null,
                      "args": null,
                      "kind": "ScalarField",
                      "name": "level",
                      "storageKey": null
                    },
                    {
                      "alias": null,
                      "args": null,
                      "kind": "ScalarField",
                      "name": "existence",
                      "storageKey": null
                    },
                    {
                      "alias": null,
                      "args": null,
                      "kind": "ScalarField",
                      "name": "ftypes",
                      "storageKey": null
                    },
                    {
                      "alias": null,
                      "args": null,
                      "kind": "ScalarField",
                      "name": "labelTypes",
                      "storageKey": null
                    }
                  ],
                  "storageKey": null
                }
              ],
              "storageKey": null
            }
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};
})();

(node as any).hash = "f88a1d31e099a8ec4f1caad9fdebed81";

export default node;
