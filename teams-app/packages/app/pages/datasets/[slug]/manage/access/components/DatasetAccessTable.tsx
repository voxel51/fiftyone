// External Libraries
import { useRecoilState } from "recoil";
import { useRouter } from "next/router";
import { useSecurityRole } from "@fiftyone/hooks";

// Material UI Components
import { Table, TableBody } from "@mui/material";

// FiftyOne Components
import { Box, Pagination, TableContainer } from "@fiftyone/teams-components";

// FiftyOne State and Mutations
import {
  DatasetPermission,
  manageAccessItemsState,
  ManageDatasetAccessTarget,
  manageDatasetGetAccessPageState,
} from "@fiftyone/teams-state";

// Local Components
import ManageGroupUserTableRow from "./ManageGroupUserTableRow";
import useDatasetAccess, {
  isGroupType,
} from "@fiftyone/hooks/src/dataset/access/useDatasetAccess";
import { useMemo } from "react";

interface Props {
  total: number;
}
export default function DatasetAccessTable(props: Props) {
  const { total: pageTotal } = props;
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;
  const [{ page, pageSize }, setPageState] = useRecoilState(
    manageDatasetGetAccessPageState
  );
  const [finalItems, setFinalItems] = useRecoilState(manageAccessItemsState);

  const { maxDatasetPermission } = useSecurityRole();
  const { setPermission, removeAccess } = useDatasetAccess(finalItems);

  const rows = useMemo(
    () =>
      finalItems.map((item: ManageDatasetAccessTarget) => {
        const itemId = isGroupType(item) ? item.groupId : item.userId;
        const finalPermission = isGroupType(item)
          ? item.permission
          : item.userPermission;

        return (
          <ManageGroupUserTableRow
            key={itemId}
            target={item}
            isGroup={isGroupType(item)}
            permission={finalPermission}
            maxDatasetPermission={
              isGroupType(item) ? null : maxDatasetPermission(item.role)
            }
            onDelete={() => {
              removeAccess(
                item,
                datasetIdentifier as string,
                (updatedItems: ManageDatasetAccessTarget[]) => {
                  setFinalItems(updatedItems);
                }
              );
            }}
            onPermissionChange={(newPermission: DatasetPermission) => {
              setPermission(
                item,
                newPermission,
                datasetIdentifier as string,
                (newItems: ManageDatasetAccessTarget[]) => {
                  setFinalItems(newItems);
                }
              );
            }}
          />
        );
      }),
    [
      datasetIdentifier,
      finalItems,
      maxDatasetPermission,
      removeAccess,
      setFinalItems,
      setPermission,
    ]
  );

  return (
    <Box>
      <TableContainer>
        <Table>
          <TableBody>{rows}</TableBody>
        </Table>
      </TableContainer>
      <Pagination
        count={pageTotal}
        page={page}
        onChange={(_, page) => {
          setPageState({ pageSize, page });
        }}
        pageSize={pageSize}
        onPageSizeChange={(pageSize) => {
          setPageState({ page, pageSize });
        }}
        onManualPageChange={(page) => {
          setPageState({ pageSize, page });
        }}
      />
    </Box>
  );
}
