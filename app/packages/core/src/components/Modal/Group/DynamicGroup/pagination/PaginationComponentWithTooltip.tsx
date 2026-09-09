import * as fos from "@fiftyone/state";
import { PaginationItemProps } from "@mui/material";
import { Anchor, Text, Tooltip } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";

export const PaginationComponentWithTooltip = React.memo(
  React.forwardRef(
    (
      {
        currentPage,
        isButton,
        orderByValue,
        ...props
      }: PaginationItemProps & {
        currentPage: number | null;
        isButton: boolean;
        orderByValue?: string | number | boolean;
      },
      ref: React.Ref<HTMLDivElement>,
    ) => {
      const { orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;

      const tooltipText = useMemo(() => {
        if (!orderBy || isButton) {
          return null;
        }

        return `${orderBy}: ${orderByValue ?? "click to load"}`;
      }, [isButton, orderBy, orderByValue]);

      props["data-cy"] = `dynamic-group-pagination-item-${
        isButton ? "btn" : currentPage
      }`;

      props["data-cy"] = `dynamic-group-pagination-item-${
        isButton ? "btn" : currentPage
      }`;

      if (tooltipText) {
        return (
          <Tooltip
            anchor={Anchor.Top}
            content={
              <Text data-cy={`tooltip-${tooltipText}`}>{tooltipText}</Text>
            }
          >
            <div ref={ref} {...props} />
          </Tooltip>
        );
      }

      return <div ref={ref} {...props} />;
    },
  ),
);
