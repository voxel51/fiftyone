/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Select } from "@voxel51/voodo";
import { Word } from "../Header/Sentence";
import usePanelLayout from "../layout";
import type { Paging } from "./model";
import usePagingSettings from "./settings";

const OPTIONS: { id: Paging; data: { label: string } }[] = [
  { id: "scroll", data: { label: "Scroll" } },
  { id: "pages", data: { label: "Pages" } },
];

/** The Display popover's Scroll | Pages choice, for the Grid layout only. */
const PagingOption = () => {
  const { layout } = usePanelLayout();
  const { paging, setPaging } = usePagingSettings();
  if (layout !== "grid") return null;

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
