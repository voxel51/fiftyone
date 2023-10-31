import { graphql } from "relay-runtime";

export default graphql`
  fragment viewFragment on Dataset {
    stages(slug: $savedViewSlug, view: $view)
    viewCls
    viewName
  }
`;
