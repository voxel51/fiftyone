import { pathColor } from "@fiftyone/state";
import * as fou from "@fiftyone/utilities";
import React from "react";
import { useRecoilValue } from "recoil";
import * as filters from "../../../Filters";

interface FilterItem {
  ftype: string;
  path: string;
  modal: boolean;
  named?: boolean;
  listField: boolean;
  title?: string;
}

export const FILTERS = {
  [fou.BOOLEAN_FIELD]: filters.BooleanFieldFilter,
  [fou.DATE_FIELD]: filters.NumericFieldFilter,
  [fou.DATE_TIME_FIELD]: filters.NumericFieldFilter,
  [fou.FLOAT_FIELD]: filters.NumericFieldFilter,
  [fou.FRAME_NUMBER_FIELD]: filters.NumericFieldFilter,
  [fou.FRAME_SUPPORT_FIELD]: filters.NumericFieldFilter,
  [fou.INT_FIELD]: filters.NumericFieldFilter,
  [fou.OBJECT_ID_FIELD]: filters.StringFieldFilter,
  [fou.STRING_FIELD]: filters.StringFieldFilter,
  ["_LABEL_TAGS"]: filters.LabelFieldFilter,
};

const FilterItem = ({
  ftype,
  listField,
  path,
  title,
  ...rest
}: FilterItem & { onBlur?: () => void; onFocus?: () => void }) => {
  const color = useRecoilValue(pathColor(path));
  return React.createElement(FILTERS[ftype], {
    key: path,
    color,
    path,
    title: title || (listField ? `${fou.LIST_FIELD}(${ftype})` : ftype),
    ...rest,
  });
};

export default FilterItem;
