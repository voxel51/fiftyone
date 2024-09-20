/**
 * @generated SignedSource<<9c13901bc2c5b513fca930949647b180>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type RecentViewsListFragment$data = {
  readonly userViews: ReadonlyArray<{
    readonly dataset: {
      readonly id: string;
      readonly name: string;
      readonly slug: string;
    } | null;
    readonly lastLoadedAt: string | null;
    readonly loadCount: number | null;
    readonly view: {
      readonly color: string | null;
      readonly createdAt: string | null;
      readonly id: string;
      readonly name: string;
      readonly slug: string;
    } | null;
  }>;
  readonly " $fragmentType": "RecentViewsListFragment";
};
export type RecentViewsListFragment$key = {
  readonly " $data"?: RecentViewsListFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"RecentViewsListFragment">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "name",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "slug",
  "storageKey": null
};
return {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "firstViews"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": require('./RecentViewsListFragmentQuery.graphql')
    }
  },
  "name": "RecentViewsListFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "first",
          "variableName": "firstViews"
        }
      ],
      "concreteType": "DatasetViewUser",
      "kind": "LinkedField",
      "name": "userViews",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "concreteType": "DatasetView",
          "kind": "LinkedField",
          "name": "view",
          "plural": false,
          "selections": [
            (v0/*: any*/),
            (v1/*: any*/),
            (v2/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "color",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "createdAt",
              "storageKey": null
            }
          ],
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
          "name": "loadCount",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "Dataset",
          "kind": "LinkedField",
          "name": "dataset",
          "plural": false,
          "selections": [
            (v0/*: any*/),
            (v1/*: any*/),
            (v2/*: any*/)
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};
})();

(node as any).hash = "b6bf2bedff96c8fea1b7948ddae3884b";

export default node;
