import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query lightningQuery($input: LightningInput!) {
    lightning(input: $input) {
      __typename
      ... on BooleanLightningResult {
        path
        false
        none
        true
      }
      ... on IntLightningResult {
        path
        intMax: max
        intMin: min
        none
      }
      ... on DateLightningResult {
        path
        dateMax: max
        dateMin: min
        none
      }
      ... on DateTimeLightningResult {
        path
        datetimeMax: max
        datetimeMin: min
        none
      }
      ... on FloatLightningResult {
        path
        inf
        max
        min
        nan
        ninf
        none
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
