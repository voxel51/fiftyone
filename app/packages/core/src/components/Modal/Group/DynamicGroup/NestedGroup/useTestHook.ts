import { graphql } from "relay-runtime";

export const TestQuery = graphql`
  query paginateGroupQuery(
    $count: Int = 20
    $cursor: String = null
    $dataset: String!
    $view: BSONArray!
    $filter: SampleFilter!
  ) {
    samples(
      dataset: $dataset
      view: $view
      first: $count
      after: $cursor
      filter: $filter
    ) {
      total
      edges {
        cursor
        node {
          __typename
          ... on ImageSample {
            id
            aspectRatio
            sample
            urls {
              field
              url
            }
          }
          ... on PointCloudSample {
            id
            sample
            urls {
              field
              url
            }
          }
          ... on VideoSample {
            id
            aspectRatio
            frameRate
            sample
            urls {
              field
              url
            }
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;
/**
 * want it to take:
 * - query
 * - returns
 *  - initial data
 *  - loadNext(variables)
 */
// export const useTestHook = <TQuery extends OperationType>(
//   query: GraphQLTaggedNode,
//   initialQueryReference?: PreloadedQuery<TQuery> | null
// ) => {
//   const [queryRef, loadQuery, disposeQuery] = useQueryLoader(
//     query,
//     initialQueryReference ?? null
//   );

//   //   const [] = usePreloadedQuery(query, queryRef);

//   const [data, setData] = useState();

//   useEffect(() => {
//     if (!queryRef) {
//       loadQuery({});
//     }
//   }, [queryRef, loadQuery]);

//   return {
//     data,
//     loadQuery,
//     disposeQuery,
//   };
// };
