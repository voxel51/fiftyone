/**
 * @generated SignedSource<<d459fbc7f63c2a480cb4402d0edb7f32>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type SearchDatasetTagsQuery$variables = {
  searchTerm: string;
};
export type SearchDatasetTagsQuery$data = {
  readonly search: ReadonlyArray<{
    readonly __typename: "Tag";
    readonly text: string;
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  }>;
};
export type SearchDatasetTagsQuery = {
  response: SearchDatasetTagsQuery$data;
  variables: SearchDatasetTagsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "searchTerm"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Literal",
        "name": "searchTypes",
        "value": [
          "Tag"
        ]
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
            "name": "text",
            "storageKey": null
          }
        ],
        "type": "Tag",
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
    "name": "SearchDatasetTagsQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "SearchDatasetTagsQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "d634601f62f944dd4d3334603fe89637",
    "id": null,
    "metadata": {},
    "name": "SearchDatasetTagsQuery",
    "operationKind": "query",
    "text": "query SearchDatasetTagsQuery(\n  $searchTerm: String!\n) {\n  search(term: $searchTerm, searchTypes: [Tag]) {\n    __typename\n    ... on Tag {\n      text\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "81a225df2d5f59dbb96486ffbb520ae5";

export default node;
