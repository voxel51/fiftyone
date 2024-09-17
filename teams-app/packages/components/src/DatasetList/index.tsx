import useDatasetsFilter from '@fiftyone/hooks/src/datasets/DatasetList/useFilters';
import {
  DatalistTableRow,
  EmptyDatasets,
  Pagination
} from '@fiftyone/teams-components';
import {
  DatasetsV2RootQueryT,
  datasetListCountState
} from '@fiftyone/teams-state';
import { changeRoute } from '@fiftyone/teams-state/src/Datasets';
import Box from '@mui/material/Box';
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef
} from 'react';
import { GraphQLTaggedNode, PreloadedQuery } from 'react-relay';
import {
  graphql,
  usePreloadedQuery,
  useRefetchableFragment
} from 'react-relay/hooks';
import { useSetRecoilState } from 'recoil';
import { DatasetListFragment$data } from './__generated__/DatasetListFragment.graphql';

// TODO: This query duplicates `TheDatasetsListQuery`, which is used
//  for the datasets count. We should figure out how to combine these two
//  queries into one, and remove the extra network requests.
export const DatasetListFragment = graphql`
  fragment DatasetListFragment on Query
  @refetchable(queryName: "DatasetListPaginationQuery") {
    datasetsPage(
      filter: $filter
      search: $search
      order: $order
      pageSize: $pageSize
      page: $page
    ) {
      prev
      page
      next
      pageSize
      pageTotal
      nodeTotal
      nodes {
        ...DatasetFrag
      }
    }
  }
`;

const DatasetList = ({
  preloadedQuery,
  InitialQuery
}: {
  InitialQuery: GraphQLTaggedNode;
  preloadedQuery: PreloadedQuery<DatasetsV2RootQueryT>;
}) => {
  const { setPageInfo, pageSize } = useDatasetsFilter();
  const result = usePreloadedQuery(InitialQuery, preloadedQuery);
  const [data] = useRefetchableFragment(DatasetListFragment, result);
  const setDatasetListCount = useSetRecoilState(datasetListCountState);
  const { datasetsPage } = data as DatasetListFragment$data;
  const { nodeTotal, page: currentPage, pageTotal } = datasetsPage;
  const { newDataset } = useDatasetsFilter();

  useEffect(() => {
    if (newDataset) {
      // when a new dataset created, refresh the list
      changeRoute({ params: {} });
    }
  }, [newDataset]);

  useEffect(() => {
    if (nodeTotal) {
      setDatasetListCount(nodeTotal || 0);
    }
  }, [nodeTotal]);

  const handleManualPageChange = useCallback(
    (pageInput: number) => {
      setPageInfo({ page: pageInput, pageSize });
    },
    [pageSize]
  );

  const handlePageChange = useCallback(
    (_: ChangeEvent<unknown>, newPage: number) => {
      setPageInfo({ page: newPage, pageSize });
    },
    [pageSize]
  );

  const ref = useRef<HTMLDivElement>();

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.dispatchEvent(
        new CustomEvent('dataset-list', { bubbles: true })
      );
    }
  }, [ref]);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageInfo({ page: 1, pageSize: newPageSize });
  }, []);

  if (datasetsPage && nodeTotal === 0) {
    return <EmptyDatasets />;
  }

  return (
    <Box ref={ref}>
      <Box
        sx={{
          bgcolor: (theme) => theme.palette.background.primary,
          boxShadow: (theme) => theme.voxelShadows.sm,
          borderRadius: 1
        }}
      >
        {datasetsPage.nodes.map((ds, index: number) => (
          <DatalistTableRow
            rowFragment={ds}
            key={index}
            noBorder={index === datasetsPage.nodes.length - 1}
          />
        ))}
      </Box>
      <Pagination
        count={pageTotal}
        page={currentPage}
        pageSize={pageSize}
        onChange={handlePageChange}
        onManualPageChange={handleManualPageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </Box>
  );
};

export default DatasetList;
