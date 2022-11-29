import { graphql } from "react-relay";

export default graphql`
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
`;
