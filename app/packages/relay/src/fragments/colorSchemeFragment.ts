import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment colorSchemeFragment on ColorScheme {
    colorPool
    fields {
      colorByAttribute
      fieldColor
      path
      valueColors {
        color
        value
      }
    }
  }
`);
