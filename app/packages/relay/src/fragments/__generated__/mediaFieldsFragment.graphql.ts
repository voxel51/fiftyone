/**
 * @generated SignedSource<<8acb625d436c0bc6f665b7f5af732677>>
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

(node as any).hash = "ab02b9789bde86352e8882ee08a9976a";

export default node;
