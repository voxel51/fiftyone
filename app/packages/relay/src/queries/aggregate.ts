import { graphql } from "react-relay";
import r from "../resolve";

// todo add all aggregate response types
export default r(graphql`
  query aggregateQuery(
    $dataset: String!
    $view: BSONArray!
    $aggregations: [Aggregate!]!
  ) {
    aggregate(datasetName: $dataset, view: $view, aggregations: $aggregations) {
      __typename
      ... on CountResponse {
        count
      }
    }
  }
`);
