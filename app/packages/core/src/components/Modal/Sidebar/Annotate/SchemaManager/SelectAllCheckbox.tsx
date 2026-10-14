/**
 * Tri-state "select all" for a section of selectable rows (the tags
 * sidebar pattern): unchecked = none selected, dash = some, check =
 * all. Checking selects every selectable row; unchecking clears.
 */

import { Checkbox, Size } from "@voxel51/voodo";
import { SelectableList } from "./styled";

const SelectAllCheckbox = ({
  ids,
  selected,
  onChange,
  label,
  "data-cy": dataCy,
}: {
  /** The section's selectable row ids. */
  ids: string[];
  selected: Set<string>;
  onChange: (ids: string[]) => void;
  /** Accessible name, e.g. "Select all active fields". */
  label: string;
  "data-cy"?: string;
}) => {
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  return (
    <SelectableList as="span" style={{ display: "inline-flex" }}>
      <Checkbox
        size={Size.Sm}
        checked={all}
        indeterminate={some && !all}
        disabled={!ids.length}
        aria-label={label}
        data-cy={dataCy}
        onChange={(checked) => onChange(checked ? ids : [])}
      />
    </SelectableList>
  );
};

export default SelectAllCheckbox;
