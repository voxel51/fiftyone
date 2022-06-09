import { PreloadedQuery } from "react-relay";
import { atom } from "recoil";
import { graphql } from "relay-runtime";
import { paginateGroupQuery } from "./__generated__/paginateGroupQuery.graphql";

export const paginateGroupQueryRef = atom<
  PreloadedQuery<paginateGroupQuery, {}>
>({
  key: "paginateGroupQueryRef",
  default: null,
});

export default graphql`
  query paginateGroupQuery(
    $dataset: String!
    $view: JSONArray!
    $count: Int
    $cursor: Int
  ) {
    ...paginateGroup_query
  }
`;

export const paginateGroupPaginationFragment = graphql`
  fragment paginateGroup_query on Query
  @refetchable(queryName: "paginateGroupPageQuery") {
    samples(dataset: $dataset, view: $view, first: $count, after: $cursor)
      @connection(key: "paginateGroup_query_samples") {
      edges {
        cursor
        node {
          __typename
          ... on ImageSample {
            height
            sample
            width
          }
          ... on VideoSample {
            frameRate
            height
            sample
            width
          }
        }
      }
    }
  }
`;
