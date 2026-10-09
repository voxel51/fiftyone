/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useGridLargeCollection } from "@fiftyone/state";
import { Select } from "@voxel51/voodo";
import { Word } from "../Header/Sentence";
import usePanelLayout from "../layout";
import type { Paging } from "./model";
import usePagingSettings from "./settings";

const OPTIONS: { id: Paging; data: { label: string } }[] = [
  { id: "scroll", data: { label: "Scroll" } },
  { id: "pages", data: { label: "Pages" } },
];

/**
 * The Display popover's Scroll | Pages choice, for the Grid layout only.
 * Pages are addressed by offset, so a large dataset only scrolls.
 */
const PagingOption = () => {
  const { layout } = usePanelLayout();
  const { paging, setPaging } = usePagingSettings();
  const large = useGridLargeCollection();
  if (layout !== "grid" || large) return null;

  return (
    <>
      <Word>Paging</Word>
      <Select
        exclusive
        portal
        value={paging}
        options={OPTIONS}
        onChange={(v) => (v === "scroll" || v === "pages") && setPaging(v)}
        data-cy="fo-grid-paging"
      />
    </>
  );
};

export default PagingOption;
