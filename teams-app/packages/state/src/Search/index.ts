export const TheSearchSuggestionQuery = graphql`
  query SearchSuggestionQuery(
    $searchTerm: String!
    $searchTypes: [SearchType!]
  ) {
    search(term: $searchTerm, searchTypes: $searchTypes) {
      __typename
      ... on Dataset {
        name
        slug
      }
      ... on Tag {
        text
      }
      ... on MediaType {
        type
      }
    }
  }
`;

export const SearchDatasetTagsQuery = graphql`
  query SearchDatasetTagsQuery($searchTerm: String!) {
    search(term: $searchTerm, searchTypes: [Tag]) {
      __typename
      ... on Tag {
        text
      }
    }
  }
`;
