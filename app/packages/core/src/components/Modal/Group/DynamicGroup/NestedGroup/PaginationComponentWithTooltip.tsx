import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { PaginationItemProps } from "@mui/material";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";

export const PaginationComponentWithTooltip = React.memo(
  React.forwardRef(
    (
      props: PaginationItemProps & {
        atomFamilyKey: string;
        currentPage: number | null;
        isButton: boolean;
      },
      ref: React.Ref<HTMLDivElement>
    ) => {
      const { atomFamilyKey, isButton, currentPage, ...otherProps } = props;

      const { orderBy } = useRecoilValue(fos.dynamicGroupParameters)!;
      const dynamicGroupSamplesStoreMap = useRecoilValue(
        fos.dynamicGroupSamplesStoreMap(atomFamilyKey)
      );

      const tooltipText = useMemo(() => {
        if (!orderBy || isButton) {
          return null;
        }

        const sample = dynamicGroupSamplesStoreMap.get(currentPage! - 1);
        return `${orderBy}: ${sample?.sample[orderBy] ?? "click to load"}`;
      }, [dynamicGroupSamplesStoreMap, isButton, orderBy, currentPage]);

      otherProps["data-cy"] = `dynamic-group-pagination-item-${
        isButton ? "btn" : currentPage
      }`;

      if (tooltipText) {
        return (
          <Tooltip text={tooltipText} placement="top-center">
            <div ref={ref} {...otherProps} />
          </Tooltip>
        );
      }

      return <div ref={ref} {...otherProps} />;
    }
  )
);
