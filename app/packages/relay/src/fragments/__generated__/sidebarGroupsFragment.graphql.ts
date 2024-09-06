/**
 * @generated SignedSource<<5824920101a6f1b350d67c862b128228>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type sidebarGroupsFragment$data = {
  readonly appConfig: {
    readonly sidebarGroups: ReadonlyArray<{
      readonly expanded: boolean | null;
      readonly name: string;
      readonly paths: ReadonlyArray<string> | null;
    }> | null;
  } | null;
  readonly datasetId: string;
  readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment" | "sampleFieldsFragment">;
  readonly " $fragmentType": "sidebarGroupsFragment";
};
export type sidebarGroupsFragment$key = {
  readonly " $data"?: sidebarGroupsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"sidebarGroupsFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "sidebarGroupsFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "datasetId",
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
          "concreteType": "SidebarGroup",
          "kind": "LinkedField",
          "name": "sidebarGroups",
          "plural": true,
          "selections": [
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "expanded",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "paths",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "name",
              "storageKey": null
            }
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "frameFieldsFragment"
    },
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "sampleFieldsFragment"
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};

(node as any).hash = "9d94d4a73e0018e461741256d90cf037";

export default node;
