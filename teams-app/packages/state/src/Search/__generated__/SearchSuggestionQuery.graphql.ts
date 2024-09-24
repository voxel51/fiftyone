/**
 * @generated SignedSource<<a6ba316dcf5c6075f41b34fae0a37b35>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type MediaTypeOption = "group" | "image" | "point_cloud" | "three_d" | "video" | "%future added value";
export type SearchType = "Dataset" | "MediaType" | "Tag" | "User" | "UserGroup" | "%future added value";
export type SearchSuggestionQuery$variables = {
  searchTerm: string;
  searchTypes?: ReadonlyArray<SearchType> | null;
};
export type SearchSuggestionQuery$data = {
  readonly search: ReadonlyArray<{
    readonly __typename: "Dataset";
    readonly name: string;
    readonly slug: string;
  } | {
    readonly __typename: "MediaType";
    readonly type: MediaTypeOption;
  } | {
    readonly __typename: "Tag";
    readonly text: string;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  }>;
};
export type SearchSuggestionQuery = {
  response: SearchSuggestionQuery$data;
  variables: SearchSuggestionQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "searchTerm"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "searchTypes"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "searchTypes",
        "variableName": "searchTypes"
      },
      {
        "kind": "Variable",
        "name": "term",
        "variableName": "searchTerm"
      }
    ],
    "concreteType": null,
    "kind": "LinkedField",
    "name": "search",
    "plural": true,
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
          }
        ],
        "type": "Dataset",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "text",
            "storageKey": null
          }
        ],
        "type": "Tag",
        "abstractKey": null
      },
      {
        "kind": "InlineFragment",
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "type",
            "storageKey": null
          }
        ],
        "type": "MediaType",
        "abstractKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "SearchSuggestionQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "SearchSuggestionQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "ff73bdcc42e55d5a8133e0044d10c726",
    "id": null,
    "metadata": {},
    "name": "SearchSuggestionQuery",
    "operationKind": "query",
    "text": "query SearchSuggestionQuery(\n  $searchTerm: String!\n  $searchTypes: [SearchType!]\n) {\n  search(term: $searchTerm, searchTypes: $searchTypes) {\n    __typename\n    ... on Dataset {\n      name\n      slug\n    }\n    ... on Tag {\n      text\n    }\n    ... on MediaType {\n      type\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "19bcdf84fb17a7f8a05f9a58db119806";

export default node;
