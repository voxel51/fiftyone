import { graphql } from 'react-relay/hooks';

const CurrentUserFragment = graphql`
  fragment CurrentUserFragment on Query
  @refetchable(queryName: "CurrentUserFragmentQuery") {
    viewer {
      apiKeys {
        createdAt
        id
        name
      }
      picture
      role
      name
      id
      email
    }
  }
`;

export default CurrentUserFragment;
