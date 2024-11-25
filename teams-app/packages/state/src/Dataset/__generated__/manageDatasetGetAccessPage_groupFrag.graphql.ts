/**
 * @generated SignedSource<<df3e2c9355104748732942224c0c6ab9>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type manageDatasetGetAccessPage_groupFrag$data = {
  readonly description: string | null;
  readonly groupId: string;
  readonly name: string;
  readonly permission: DatasetPermission | null;
  readonly slug: string;
  readonly " $fragmentType": "manageDatasetGetAccessPage_groupFrag";
};
export type manageDatasetGetAccessPage_groupFrag$key = {
  readonly " $data"?: manageDatasetGetAccessPage_groupFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_groupFrag">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "manageDatasetGetAccessPage_groupFrag",
  "selections": [
    {
      "alias": "groupId",
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
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
      "kind": "ScalarField",
      "name": "slug",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "permission",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "description",
      "storageKey": null
    }
  ],
  "type": "DatasetUserGroup",
  "abstractKey": null
};

(node as any).hash = "3382a4eeab5f6013a1912a625fe6524f";

export default node;
