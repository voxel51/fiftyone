import { graphql } from "relay-runtime";

export default graphql`
  fragment savedViewsFragment on Query
  @refetchable(queryName: "savedViewsFragmentQuery") {
    savedViews(datasetName: $name) {
      id
      datasetId
      name
      slug
      description
      color
      viewStages
      createdAt
      lastModifiedAt
      lastLoadedAt
    }
  }
`;
