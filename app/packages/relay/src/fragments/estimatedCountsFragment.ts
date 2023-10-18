import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment estimatedCountsFragment on Dataset {
    estimatedFrameCount
    estimatedSampleCount
  }
`);
