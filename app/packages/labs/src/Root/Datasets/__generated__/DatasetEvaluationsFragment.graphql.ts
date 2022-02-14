/**
 * @generated SignedSource<<2f245bd001b4fd226a2d87fce567b1f6>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetEvaluationsFragment$data = {
  readonly config: {
    readonly predField: string;
    readonly gtField: string;
  };
  readonly " $fragmentSpreads": FragmentRefs<"DatasetRunFragment">;
  readonly " $fragmentType": "DatasetEvaluationsFragment";
};
export type DatasetEvaluationsFragment = DatasetEvaluationsFragment$data;
export type DatasetEvaluationsFragment$key = {
  readonly " $data"?: DatasetEvaluationsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetEvaluationsFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "DatasetEvaluationsFragment",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "DatasetRunFragment"
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "EvaluationRunConfig",
      "kind": "LinkedField",
      "name": "config",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "predField",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "gtField",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "EvaluationRun",
  "abstractKey": null
};

(node as any).hash = "267a2463af95780a388920956a0e1a78";

export default node;
