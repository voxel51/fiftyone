/**
 * @generated SignedSource<<988549a4f4c71c38d1b07a74663f5d27>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type runsLogQuery$variables = {
  run: string;
};
export type runsLogQuery$data = {
  readonly delegatedOperation: {
    readonly logConnection: {
      readonly edges: ReadonlyArray<{
        readonly cursor: string;
        readonly node: {
          readonly content: string | null;
          readonly date: string | null;
          readonly level: string | null;
        };
      }>;
      readonly pageInfo: {
        readonly endCursor: string | null;
        readonly hasNextPage: boolean;
        readonly hasPreviousPage: boolean;
        readonly startCursor: string | null;
      };
    };
  };
};
export type runsLogQuery = {
  response: runsLogQuery$data;
  variables: runsLogQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "run"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "operationId",
        "variableName": "run"
      }
    ],
    "concreteType": "DelegatedOperation",
    "kind": "LinkedField",
    "name": "delegatedOperation",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Literal",
            "name": "first",
            "value": 200000
          }
        ],
        "concreteType": "DelegatedOperationLogConnection",
        "kind": "LinkedField",
        "name": "logConnection",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "PageInfo",
            "kind": "LinkedField",
            "name": "pageInfo",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "hasNextPage",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "hasPreviousPage",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "startCursor",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "endCursor",
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "DelegatedOperationLogEdge",
            "kind": "LinkedField",
            "name": "edges",
            "plural": true,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "DelegatedOperationLog",
                "kind": "LinkedField",
                "name": "node",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "content",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "date",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "level",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "cursor",
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": "logConnection(first:200000)"
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
    "name": "runsLogQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsLogQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "4d1836ffc845b191dee6b3ba9cf2fe4d",
    "id": null,
    "metadata": {},
    "name": "runsLogQuery",
    "operationKind": "query",
    "text": "query runsLogQuery(\n  $run: String!\n) {\n  delegatedOperation(operationId: $run) {\n    logConnection(first: 200000) {\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      edges {\n        node {\n          content\n          date\n          level\n        }\n        cursor\n      }\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "faf499707179c48c46d16c762bc5f494";

export default node;
