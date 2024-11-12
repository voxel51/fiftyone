import { graphql } from "react-relay";

export const productVersionQuery = graphql`
  query commonProductVersionQuery {
    version
  }
`;
