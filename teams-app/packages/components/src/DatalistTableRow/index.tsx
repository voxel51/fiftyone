import React, { useMemo } from "react";
import Link from "next/link";
import { useFragment } from "react-relay";
import {
  ResizableTagList,
  DatasetPin,
  Timestamp,
} from "@fiftyone/teams-components";
import {
  Box,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CopyAllOutlined, MoreVert } from "@mui/icons-material";

import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  canMutateDataset,
  DatasetFragment,
  EDIT_DATASET,
} from "@fiftyone/teams-state";

import useDatasetsFilter from "@fiftyone/hooks/src/datasets/DatasetList/useFilters";
import { useHover } from "@fiftyone/hooks";
import { DatasetFrag$key } from "@fiftyone/teams-state/src/Dataset/__generated__/DatasetFrag.graphql";

interface DatalistTableRowProps {
  rowFragment: DatasetFrag$key;
  noBorder?: Boolean;
}

const DatalistTableRow = (props: DatalistTableRowProps) => {
  const [hoverRef, isHovering] = useHover();
  const row = useFragment(DatasetFragment, props.rowFragment);
  const theme = useTheme();

  const { field } = useDatasetsFilter();

  const {
    tags = [],
    mediaType: datasetMediaType,
    name,
    sampleFieldsCount,
    samplesCount,
    lastLoadedAt,
    createdAt,
    slug,
    id,
  } = row;
  const { noBorder } = props;
  const dateFieldText = field === "createdAt" ? "Created" : "Last loaded";
  const timeColumn = field === "createdAt" ? createdAt : lastLoadedAt;

  const isEditable = canMutateDataset(EDIT_DATASET, row);

  // Dataset actions menu
  const [datasetActionsMenuElem, setDatasetActionsMenuElem] =
    React.useState<null | HTMLElement>(null);
  const isDatasetActionsMenuOpen = Boolean(datasetActionsMenuElem);

  const mediaType = useMemo(() => {
    switch (datasetMediaType) {
      case "group":
        return "sample";
      case "point_cloud":
        return "point cloud";
      case "three_d":
        return "scene";
      default:
        return datasetMediaType || "sample";
    }
  }, [datasetMediaType]);

  const toggleDatasetActionsMenu = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    setDatasetActionsMenuElem(event.currentTarget);
  };
  const closeDatasetActionsMenu = () => {
    setDatasetActionsMenuElem(null);
  };

  return (
    <div ref={hoverRef} data-testid="dataset-box">
      <Link key={id} href={`/datasets/${encodeURIComponent(slug)}/samples`}>
        <Box
          sx={{
            py: 1.75,
            pl: 3,
            pr: 1.25,
            borderBottom: !noBorder && `1px solid ${theme.palette.divider}`,
            display: "flex",
            alignItems: "baseline",
            cursor: "pointer",

            "&:hover": {
              background: theme.palette.background.primaryHover,
            },
          }}
        >
          <Box
            flexGrow="1"
            sx={{
              maxWidth: "30%",
              minWidth: "30%",
            }}
            display="flex"
            flexDirection="row"
          >
            <Typography
              variant="body2"
              noWrap
              fontWeight="semiBold"
              data-testid={`dataset-table-row-${name}-title`}
            >
              {name}
            </Typography>
            <DatasetPin
              styles={{ pl: 0.75, pt: 0.5 }}
              row={row}
              fontSize="1.05rem"
              isHovering={isHovering as boolean}
            />
          </Box>
          <Box
            flexGrow="1"
            sx={{
              maxWidth: "20%",
              minWidth: "20%",
              paddingLeft: 1,
            }}
          >
            <Box display="flex" alignItems="center">
              <Typography variant="body1" noWrap>
                {samplesCount
                  ? `${samplesCount?.toLocaleString()}
              ${mediaType}${samplesCount > 1 ? "s" : ""}`
                  : "No samples"}
              </Typography>
              {!!sampleFieldsCount && (
                <Typography variant="body1" noWrap paddingLeft={0.5}>
                  {<>&#183; </>}
                  {samplesCount
                    ? `${sampleFieldsCount?.toLocaleString()}
                field${sampleFieldsCount > 1 ? "s" : ""}`
                    : "No samples"}
                </Typography>
              )}
            </Box>
          </Box>
          <Box
            flexGrow="1"
            flexDirection="row"
            sx={{
              maxWidth: "15%",
              minWidth: "15%",
              paddingLeft: 1,
            }}
          >
            <Typography variant="body1" noWrap>
              {dateFieldText}{" "}
              <Timestamp timestamp={timeColumn} variant="body1" noWrap />
            </Typography>
          </Box>
          <Box flexGrow="2" display="flex" overflow="hidden">
            <ResizableTagList tags={tags} subtractWidth={50} />
          </Box>
          <Box
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {isEditable && (
              <>
                <IconButton
                  aria-label="more"
                  id="actions-button"
                  aria-controls={
                    isDatasetActionsMenuOpen ? "actions-menu" : undefined
                  }
                  aria-expanded={isDatasetActionsMenuOpen ? "true" : undefined}
                  aria-haspopup="true"
                  onClick={toggleDatasetActionsMenu}
                >
                  <MoreVert />
                </IconButton>
                <Menu
                  id="actions-menu"
                  anchorEl={datasetActionsMenuElem}
                  open={isDatasetActionsMenuOpen}
                  onClose={closeDatasetActionsMenu}
                  MenuListProps={{
                    "aria-labelledby": "actions-button",
                  }}
                >
                  <Link href={`/datasets/${slug}/manage/basic_info`}>
                    <MenuItem>
                      <ListItemIcon>
                        <EditOutlinedIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Edit dataset</ListItemText>
                    </MenuItem>
                  </Link>
                  <MenuItem
                    onClick={() => {
                      const pathname = window.location.host;
                      const url = `${pathname}/datasets/${slug}/samples`;
                      navigator.clipboard.writeText(url);
                      closeDatasetActionsMenu();
                    }}
                  >
                    <ListItemIcon>
                      <CopyAllOutlined fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Copy URL</ListItemText>
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        </Box>
      </Link>
    </div>
  );
};

export default DatalistTableRow;
