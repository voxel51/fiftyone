import { graphql } from "relay-runtime";

export default graphql`
  query datasetQuery($savedViewSlug: String, $name: String!, $view: BSONArray) {
    dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {
      name
      ...datasetFragment
    }
    ...savedViewsFragment
    ...configFragment
    ...stageDefinitionsFragment
  }
`;
