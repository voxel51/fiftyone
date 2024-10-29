import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query lightningQuery($input: LightningInput!) {
    lightning(input: $input) {
      __typename
      ... on BooleanLightningResult {
        path
        false
        true
      }
      ... on IntLightningResult {
        path
        intMax: max
        intMin: min
      }
      ... on DateLightningResult {
        path
        dateMax: max
        dateMin: min
      }
      ... on DateTimeLightningResult {
        path
        datetimeMax: max
        datetimeMin: min
      }
      ... on FloatLightningResult {
        path
        inf
        max
        min
        nan
        ninf
      }
      ... on ObjectIdLightningResult {
        path
        values
      }
      ... on StringLightningResult {
        path
        values
      }
    }
  }
`);
