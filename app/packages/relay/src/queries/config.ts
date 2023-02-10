import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query configQuery {
    config {
      colorBy
      colorPool
      colorscale
      gridZoom
      loopVideos
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
