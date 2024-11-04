import * as fou from "@fiftyone/utilities";
import React from "react";
import * as filters from "../../../Filters";

interface FilterItem {
  color: string;
  ftype: string;
  listField: boolean;
  modal: boolean;
  named?: boolean;
  path: string;
  title?: string;
}

export const FILTERS = {
  [fou.BOOLEAN_FIELD]: filters.BooleanFieldFilter,
  [fou.DATE_FIELD]: filters.DateFieldFilter,
  [fou.DATE_TIME_FIELD]: filters.DateFieldFilter,
  [fou.FLOAT_FIELD]: filters.NumericFieldFilter,
  [fou.FRAME_NUMBER_FIELD]: filters.NumericFieldFilter,
  [fou.FRAME_SUPPORT_FIELD]: filters.NumericFieldFilter,
  [fou.INT_FIELD]: filters.NumericFieldFilter,
  [fou.OBJECT_ID_FIELD]: filters.StringFieldFilter,
  [fou.STRING_FIELD]: filters.StringFieldFilter,
  _LABEL_TAGS: filters.LabelFieldFilter,
};

const FilterItem = ({
  ftype,
  listField,
  path,
  title,
  ...rest
}: FilterItem & { onBlur?: () => void; onFocus?: () => void }) => {
  return React.createElement(FILTERS[ftype], {
    key: path,
    path,
    title: title || (listField ? `${fou.LIST_FIELD}(${ftype})` : ftype),
    ...rest,
  });
};

export default FilterItem;
