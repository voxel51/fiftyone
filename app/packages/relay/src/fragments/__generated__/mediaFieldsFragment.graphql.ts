/**
 * @generated SignedSource<<a3ab4ad2dfc47512de3d717569c80233>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type mediaFieldsFragment$data = {
  readonly appConfig: {
    readonly gridMediaField: string;
    readonly mediaFields: ReadonlyArray<string> | null;
  } | null;
  readonly name: string;
  readonly sampleFields: ReadonlyArray<{
    readonly path: string;
  }>;
  readonly " $fragmentType": "mediaFieldsFragment";
};
export type mediaFieldsFragment$key = {
  readonly " $data"?: mediaFieldsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"mediaFieldsFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "mediaFieldsFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "name",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "DatasetAppConfig",
      "kind": "LinkedField",
      "name": "appConfig",
      "plural": false,
      "selections": [
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
        }
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "SampleField",
      "kind": "LinkedField",
      "name": "sampleFields",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "path",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "12bf18714983f2f5a61167b9e5703f8e";

export default node;
