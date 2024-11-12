import { graphql, useFragment, usePreloadedQuery } from "react-relay/hooks";
import { Suspense, useState } from "react";
import { useRecoilValue } from "recoil";

import { exampleGraphQLSelector } from "@fiftyone/teams-state";

import { UuidExampleQuery } from "./__generated__/UuidExampleQuery.graphql";
import { UuidExampleFragment_viewer$key } from "./__generated__/UuidExampleFragment_viewer.graphql";

import withRelay from "../../lib/withRelay";
import { RelayProps } from "relay-nextjs";

const ExampleFragment = graphql`
  fragment UuidExampleFragment_viewer on User {
    id
  }
`;

const ExampleFragmentComponent: React.FC<{
  fragment: UuidExampleFragment_viewer$key;
}> = ({ fragment }) => {
  const data = useFragment(ExampleFragment, fragment);
  return <div>{data.id}</div>;
};

/**
 * Each page should have a Query. This represents one GraphQL request. It
 * should be composed of all data to render the initial page (SSR). The query
 * can and should be organized into fragments, pagination fragements, and
 * refetchable fragments as necessary to be shared via fragment references
 * across the components.
 *
 * Defining data requirements through fragments largely decouples component
 * development from page development, allowing for better reuse and isolation.
 * Only the fragment spread (i.e. "...MyFragment_entity") is required by the
 * Page Query.
 */
const ExampleQuery = graphql`
  query UuidExampleQuery($uuid: String!) {
    example(uuid: $uuid)
    viewer {
      ...UuidExampleFragment_viewer
    }
  }
`;

const ExampleGraphQLRecoilComponent = () => {
  const response = useRecoilValue(exampleGraphQLSelector);

  return <div>Recoil Response! - {response}</div>;
};

function Example({ preloadedQuery }: RelayProps<{}, UuidExampleQuery>) {
  const { example, viewer } = usePreloadedQuery(ExampleQuery, preloadedQuery);
  const [showSelector, setShowSelector] = useState(false);

  return (
    <div>
      <div>{example}</div>
      <button onClick={() => setShowSelector(true)}>Click Me</button>
      {showSelector && (
        <Suspense fallback={"loading..."}>
          <ExampleGraphQLRecoilComponent />
        </Suspense>
      )}
      {viewer && <ExampleFragmentComponent fragment={viewer} />}
    </div>
  );
}

export default withRelay(Example, ExampleQuery, {});
