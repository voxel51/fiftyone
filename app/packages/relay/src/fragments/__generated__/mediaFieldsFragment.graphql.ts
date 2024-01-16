/**
 * @generated SignedSource<<6a026f47ac9fe6e3324ad7be21c88269>>
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
    readonly modalMediaField: string;
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
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "modalMediaField",
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

(node as any).hash = "f65b23fc366d07867fc580339a336842";

export default node;
