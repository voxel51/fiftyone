import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query lightningQuery($input: LightningInput!) {
    lightning(input: $input) {
      __typename
      ... on LightningResult {
        path
      }
      ... on BooleanLightningResult {
        false
        true
      }
      ... on IntLightningResult {
        intMax: max
        intMin: min
      }
      ... on DateLightningResult {
        dateMax: max
        dateMin: min
      }
      ... on DateTimeLightningResult {
        datetimeMax: max
        datetimeMin: min
      }
      ... on FloatLightningResult {
        inf
        max
        min
        nan
        ninf
      }
      ... on StringLightningResult {
        values
      }
    }
  }
`);
