import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment colorSchemeFragment on ColorScheme {
    colorBy
    colorPool
    multicolorKeypoints
    opacity
    showSkeletons
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
