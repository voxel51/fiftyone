import * as fos from "@fiftyone/state";
import { Size, Toggle } from "@voxel51/voodo";
import React from "react";
import { useRecoilState } from "recoil";
import { gridPage } from "../recoil";

const GRID_PAGE_PARAM = "page";

function clearPageInLocation() {
  if (typeof window === "undefined") return;
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete(GRID_PAGE_PARAM);
  const search = searchParams.toString();
  const nextUrl = `${window.location.pathname}${search.length ? `?${search}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.pushState(window.history.state, "", nextUrl);
  }
}

const PaginationToggle = () => {
  const [paginationEnabled, setPaginationEnabled] = useRecoilState(
    fos.appConfigOption({ modal: false, key: "gridPagination" })
  );
  const [, setCurrentPage] = useRecoilState(gridPage);

  return (
    <Toggle
      size={Size.Md}
      label="Pagination"
      checked={paginationEnabled}
      onChange={(checked) => {
        if (checked === paginationEnabled) return;
        setPaginationEnabled(!paginationEnabled);
        setCurrentPage(0);
        clearPageInLocation();
      }}
    />
  );
};

export default PaginationToggle;
