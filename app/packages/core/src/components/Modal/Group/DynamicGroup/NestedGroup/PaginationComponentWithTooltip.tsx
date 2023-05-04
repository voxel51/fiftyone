import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { PaginationItemProps } from "@mui/material";
import React, { useMemo } from "react";
import { useRecoilValue } from "recoil";

export const PaginationComponentWithTooltip = React.memo(
  (
    props: PaginationItemProps & {
      atomFamilyKey: string;
      currentPage: number | null;
      isButton: boolean;
    }
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

    if (tooltipText) {
      return (
        <Tooltip text={tooltipText} placement="top-center">
          <div {...otherProps} />
        </Tooltip>
      );
    }

    return <div {...otherProps} />;
  }
);
