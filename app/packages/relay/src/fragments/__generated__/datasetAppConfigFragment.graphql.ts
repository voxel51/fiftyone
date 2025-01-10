/**
 * @generated SignedSource<<a8256bdb700a212f19a7919e09638ed0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type datasetAppConfigFragment$data = {
  readonly colorScheme: {
    readonly " $fragmentSpreads": FragmentRefs<"colorSchemeFragment">;
  } | null;
  readonly disableFrameFiltering: boolean | null;
  readonly gridMediaField: string;
  readonly maskThreshold: number | null;
  readonly mediaFallback: boolean;
  readonly mediaFields: ReadonlyArray<string> | null;
  readonly modalMediaField: string;
  readonly plugins: object | null;
  readonly " $fragmentType": "datasetAppConfigFragment";
};
export type datasetAppConfigFragment$key = {
  readonly " $data"?: datasetAppConfigFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"datasetAppConfigFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "datasetAppConfigFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "ColorScheme",
      "kind": "LinkedField",
      "name": "colorScheme",
      "plural": false,
      "selections": [
        {
          "args": null,
          "kind": "FragmentSpread",
          "name": "colorSchemeFragment"
        }
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "disableFrameFiltering",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "gridMediaField",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaFields",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "modalMediaField",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "mediaFallback",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "plugins",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "maskThreshold",
      "storageKey": null
    }
  ],
  "type": "DatasetAppConfig",
  "abstractKey": null
};

(node as any).hash = "034a12cf2d1c1d721e41f964d7d7d918";

export default node;
