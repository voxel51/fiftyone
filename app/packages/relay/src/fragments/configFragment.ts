import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  fragment configFragment on Query {
    config {
      colorBy
      colorPool
      colorscale
      gridZoom
      lightningThreshold
      loopVideos
      multicolorKeypoints
      notebookHeight
      plugins
      showConfidence
      showIndex
      showLabel
      showSkeletons
      showTooltip
      sidebarMode
      theme
      timezone
      useFrameNumber
    }
    colorscale
  }
`);
