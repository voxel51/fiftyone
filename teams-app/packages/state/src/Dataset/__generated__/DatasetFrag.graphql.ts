/**
 * @generated SignedSource<<96c387e50a679a8cc9a35ceb6a9f4fae>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type MediaTypeOption = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type DatasetFrag$data = {
  readonly createdAt: string | null;
  readonly defaultPermission: DatasetPermission;
  readonly id: string;
  readonly lastLoadedAt: string | null;
  readonly mediaType: MediaTypeOption | null;
  readonly name: string;
  readonly sampleFieldsCount: number;
  readonly samplesCount: number;
  readonly slug: string;
  readonly tags: ReadonlyArray<string>;
  readonly viewer: {
    readonly activePermission: DatasetPermission;
    readonly pinned: boolean;
    readonly pinnedAt: string | null;
    readonly user: {
      readonly email: string;
      readonly id: string;
    };
  };
  readonly " $fragmentType": "DatasetFrag";
};
export type DatasetFrag$key = {
  readonly " $data"?: DatasetFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetFrag">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "DatasetFrag",
  "selections": [
    (v0/*: any*/),
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
      "name": "mediaType",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "createdAt",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "lastLoadedAt",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "defaultPermission",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "samplesCount",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "sampleFieldsCount",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "tags",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "DatasetUser",
      "kind": "LinkedField",
      "name": "viewer",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "concreteType": "User",
          "kind": "LinkedField",
          "name": "user",
          "plural": false,
          "selections": [
            (v0/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "email",
              "storageKey": null
            }
          ],
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "pinned",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "pinnedAt",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "activePermission",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};
})();

(node as any).hash = "e6b08f47b961a366f7f10d13bed0f499";

export default node;
