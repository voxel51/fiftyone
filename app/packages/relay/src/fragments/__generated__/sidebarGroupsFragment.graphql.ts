/**
 * @generated SignedSource<<224f120cbee602f090fa7e189aa8a02f>>
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
  readonly name: string;
  readonly " $fragmentSpreads": FragmentRefs<"frameFieldsFragment" | "sampleFieldsFragment">;
  readonly " $fragmentType": "sidebarGroupsFragment";
};
export type sidebarGroupsFragment$key = {
  readonly " $data"?: sidebarGroupsFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"sidebarGroupsFragment">;
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
  "name": "sidebarGroupsFragment",
  "selections": [
    (v0/*: any*/),
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
            (v0/*: any*/)
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
})();

(node as any).hash = "3613f2a33c910c4e85495621b1c6ae34";

export default node;
