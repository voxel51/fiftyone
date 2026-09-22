import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { formatPrimitive, type Primitive } from "@fiftyone/utilities";
import { PaginationItemProps } from "@mui/material";
import React, { useMemo } from "react";

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
        orderByValue?: Primitive | boolean;
      },
      ref: React.Ref<HTMLDivElement>,
    ) => {
      const orderBy = fos.useDynamicGroupOrderBy();
      const ftype = fos.useFieldType(orderBy);
      const timeZone = fos.useTimeZone();

      const tooltipText = useMemo(() => {
        if (!orderBy || isButton) {
          return null;
        }

        if (orderByValue === undefined || orderByValue === null) {
          return `${orderBy}: click to load`;
        }

        // a date field arrives as a `{_cls, datetime}` wrapper, which reads as
        // "[object Object]" when interpolated raw
        const formatted =
          typeof orderByValue === "boolean"
            ? String(orderByValue)
            : (formatPrimitive({
                ftype: ftype ?? "",
                timeZone,
                value: orderByValue,
              }) ?? orderByValue);

        return `${orderBy}: ${formatted}`;
      }, [ftype, isButton, orderBy, orderByValue, timeZone]);

      props["data-cy"] = `dynamic-group-pagination-item-${
        isButton ? "btn" : currentPage
      }`;

      if (tooltipText) {
        return (
          <Tooltip text={tooltipText} placement="top-center">
            <div ref={ref} {...props} />
          </Tooltip>
        );
      }

      return <div ref={ref} {...props} />;
    },
  ),
);
