import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query countValuesQuery($dataset: String!, $view: BSONArray!, $path: String!) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ countValues: { field: $path } }]
    ) {
      __typename
      ... on BoolCountValuesResponse {
        values {
          value
          bool: key
        }
      }
      ... on StrCountValuesResponse {
        values {
          value
          str: key
        }
      }
    }
  }
`);
