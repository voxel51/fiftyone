/**
 * @generated SignedSource<<5d3f20180ecd7669b71c1a86e19b585d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type manageDatasetGetAccessPage_accessFrag$data = {
  readonly __typename: "DatasetUser";
  readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_userFrag">;
  readonly " $fragmentType": "manageDatasetGetAccessPage_accessFrag";
} | {
  readonly __typename: "DatasetUserGroup";
  readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_groupFrag">;
  readonly " $fragmentType": "manageDatasetGetAccessPage_accessFrag";
} | {
  // This will never be '%other', but we need some
  // value in case none of the concrete values match.
  readonly __typename: "%other";
  readonly " $fragmentType": "manageDatasetGetAccessPage_accessFrag";
};
export type manageDatasetGetAccessPage_accessFrag$key = {
  readonly " $data"?: manageDatasetGetAccessPage_accessFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_accessFrag">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "manageDatasetGetAccessPage_accessFrag",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "__typename",
      "storageKey": null
    },
    {
      "kind": "InlineFragment",
      "selections": [
        {
          "args": null,
          "kind": "FragmentSpread",
          "name": "manageDatasetGetAccessPage_userFrag"
        }
      ],
      "type": "DatasetUser",
      "abstractKey": null
    },
    {
      "kind": "InlineFragment",
      "selections": [
        {
          "args": null,
          "kind": "FragmentSpread",
          "name": "manageDatasetGetAccessPage_groupFrag"
        }
      ],
      "type": "DatasetUserGroup",
      "abstractKey": null
    }
  ],
  "type": "DatasetAccess",
  "abstractKey": "__isDatasetAccess"
};

(node as any).hash = "1fcd2a425685bcd3b9c05f00bde89891";

export default node;
