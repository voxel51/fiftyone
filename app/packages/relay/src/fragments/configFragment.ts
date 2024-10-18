import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment configFragment on Query {
    config {
      colorBy
      colorPool
      colorscale
      disableFrameFiltering
      gridZoom
      enableQueryPerformance
      defaultQueryPerformance
      loopVideos
      mediaFallback
      multicolorKeypoints
      notebookHeight
      plugins
      showConfidence
      showIndex
      showLabel
      showSkeletons
      showTooltip
      theme
      timezone
      useFrameNumber
    }
    colorscale
  }
`);
