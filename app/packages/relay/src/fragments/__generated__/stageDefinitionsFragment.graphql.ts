/**
 * @generated SignedSource<<38f4127be8a626c00aee3dbcfc735f39>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
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
              "name": "default",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "placeholder",
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

(node as any).hash = "a2aaa4423c5d326e247ab78c26d877b4";

export default node;
