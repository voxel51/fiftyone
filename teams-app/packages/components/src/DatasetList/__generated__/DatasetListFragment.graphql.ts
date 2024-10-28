/**
 * @generated SignedSource<<d90410181f179afc2cd9c7d027297aa0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment, RefetchableFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetListFragment$data = {
  readonly datasetsPage: {
    readonly next: number | null;
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly " $fragmentSpreads": FragmentRefs<"DatasetFrag">;
    }>;
    readonly page: number | null;
    readonly pageSize: number;
    readonly pageTotal: number;
    readonly prev: number | null;
  };
  readonly " $fragmentType": "DatasetListFragment";
};
export type DatasetListFragment$key = {
  readonly " $data"?: DatasetListFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"DatasetListFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [
    {
      "kind": "RootArgument",
      "name": "filter"
    },
    {
      "kind": "RootArgument",
      "name": "order"
    },
    {
      "kind": "RootArgument",
      "name": "page"
    },
    {
      "kind": "RootArgument",
      "name": "pageSize"
    },
    {
      "kind": "RootArgument",
      "name": "search"
    }
  ],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [],
      "operation": require('./DatasetListPaginationQuery.graphql')
    }
  },
  "name": "DatasetListFragment",
  "selections": [
    {
      "alias": null,
      "args": [
        {
          "kind": "Variable",
          "name": "filter",
          "variableName": "filter"
        },
        {
          "kind": "Variable",
          "name": "order",
          "variableName": "order"
        },
        {
          "kind": "Variable",
          "name": "page",
          "variableName": "page"
        },
        {
          "kind": "Variable",
          "name": "pageSize",
          "variableName": "pageSize"
        },
        {
          "kind": "Variable",
          "name": "search",
          "variableName": "search"
        }
      ],
      "concreteType": "DatasetPage",
      "kind": "LinkedField",
      "name": "datasetsPage",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "prev",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "page",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "next",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "pageSize",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "pageTotal",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "nodeTotal",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "Dataset",
          "kind": "LinkedField",
          "name": "nodes",
          "plural": true,
          "selections": [
            {
              "args": null,
              "kind": "FragmentSpread",
              "name": "DatasetFrag"
            }
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

(node as any).hash = "71e3c437fec6c72026d5d6fc642340ea";

export default node;
