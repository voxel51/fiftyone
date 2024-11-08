import { Box, TableSkeleton, Timestamp } from "@fiftyone/teams-components";
import { formatNumber, pluralize } from "@fiftyone/teams-utilities";
import {
  BoxProps,
  Divider,
  Link,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useMemo } from "react";

export default function DatasetHighlightsWidget(
  props: DatasetHighlightsWidgetProps
) {
  const { emptyTitle, items, loading, title, containerProps = {} } = props;
  const showEmptyState = useMemo(() => {
    return !Array.isArray(items) || items.length === 0;
  }, [items]);

  return (
    <Box {...containerProps}>
      <Typography variant="body2" fontWeight="semiBold" paddingBottom={2}>
        {title}
      </Typography>
      <Divider />
      {loading && <TableSkeleton />}
      {showEmptyState && !loading && (
        <Typography
          variant="body1"
          fontWeight="medium"
          paddingTop={2}
          textAlign="center"
        >
          {emptyTitle || "No items yet"}
        </Typography>
      )}
      {!showEmptyState && !loading && (
        <List>
          {items.map((item, i) => (
            <WidgetItem key={`${title}-${i}`} {...item} />
          ))}
        </List>
      )}
    </Box>
  );
}

function WidgetItem(props: DatasetHighlightsWidgetItem) {
  const {
    Icon,
    SecondaryAction,
    dataset,
    link,
    onClick,
    samplesCount,
    subtitle,
    timestamp,
    title,
  } = props;

  const subtitleArray = Array.isArray(subtitle) ? subtitle : [subtitle];

  return (
    <ListItem
      disablePadding
      sx={{ paddingX: 0 }}
      secondaryAction={SecondaryAction}
      component={link && WidgetLink}
      to={link}
    >
      <ListItemButton
        onClick={() => {
          if (onClick) onClick(props);
        }}
        sx={{ borderRadius: 1, py: 0.25, px: 1.25 }}
      >
        {Icon && (
          <ListItemIcon sx={{ minWidth: "auto", pr: 1, pl: 0 }}>
            {Icon}
          </ListItemIcon>
        )}
        <ListItemText>
          <Typography
            variant="body2"
            fontWeight="medium"
            sx={{
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {title}
          </Typography>
          <Stack
            direction="row"
            divider={<Typography>&#x2022;</Typography>}
            spacing={1}
          >
            {dataset && (
              <Typography variant="body1" noWrap>
                {dataset}
              </Typography>
            )}
            {samplesCount && (
              <Typography variant="body1" noWrap>
                {formatNumber(samplesCount)} {pluralize(samplesCount, "sample")}
              </Typography>
            )}
            {timestamp && (
              <Timestamp timestamp={timestamp} variant="body1" noWrap />
            )}
            {subtitleArray.map((item) => (
              <Typography variant="body1" noWrap>
                {item}
              </Typography>
            ))}
          </Stack>
        </ListItemText>
      </ListItemButton>
    </ListItem>
  );
}

function WidgetLink({ to, ...props }) {
  return (
    <NextLink href={to} passHref>
      <Link {...props} />
    </NextLink>
  );
}

type DatasetHighlightsWidgetProps = {
  emptyTitle?: string;
  items: Array<DatasetHighlightsWidgetItem>;
  onClick?: DatasetHighlightsWidgetItemClickHandler;
  title: string;
  containerProps?: BoxProps;
  loading?: boolean;
};

type DatasetHighlightsWidgetItem = {
  Icon?: JSX.Element;
  SecondaryAction?: JSX.Element;
  dataset?: string;
  link?: string;
  onClick?: DatasetHighlightsWidgetItemClickHandler;
  samplesCount?: number;
  subtitle?: string | string[];
  timestamp?: Date | number | string;
  title: string;
};

type DatasetHighlightsWidgetItemClickHandler = (
  item: DatasetHighlightsWidgetItem
) => void;
