import { useCallback, useEffect } from "react";

type UsePaginationOptions = {
  paginationEnabled: boolean;
  setPaginationEnabled: (next: boolean) => void;
  currentPage: number;
  setCurrentPage: (next: number) => void;
  total: number;
  pageSize: number;
};

type UsePaginationResult = {
  handlePaginationToggle: () => void;
  maxPage: number;
  safePage: number;
  start: number;
  end: number;
};

const GRID_PAGE_PARAM = "page";

/**
 * Clamps a page index into the valid zero-based page range.
 */
function clampPage(page: number, maxPage: number) {
  return Math.max(0, Math.min(page, maxPage));
}

/**
 * Reads the page query parameter from the current URL search string.
 */
function getPageFromSearch(search: string) {
  const value = new URLSearchParams(search).get(GRID_PAGE_PARAM);
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page - 1 : 0;
}

/**
 * Writes the current page to the browser location if it differs.
 */
function setPageInLocation(page: number) {
  const searchParams = new URLSearchParams(window.location.search);

  if (page > 0) {
    searchParams.set(GRID_PAGE_PARAM, String(page + 1));
  } else {
    searchParams.delete(GRID_PAGE_PARAM);
  }

  const search = searchParams.toString();
  const nextUrl = `${window.location.pathname}${
    search.length ? `?${search}` : ""
  }${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.pushState(window.history.state, "", nextUrl);
  }
}

/**
 * Keeps grid pagination state, URL state, and derived page ranges in sync.
 */
export default function usePagination({
  paginationEnabled,
  setPaginationEnabled,
  currentPage,
  setCurrentPage,
  total,
  pageSize,
}: UsePaginationOptions): UsePaginationResult {
  const safePageSize = Math.max(1, pageSize);
  const maxPage = Math.max(0, Math.ceil(total / safePageSize) - 1);
  const safePage = clampPage(currentPage, maxPage);

  /**
   * Toggles pagination and resets the visible page to the first page.
   */
  const handlePaginationToggleCallback = useCallback(
    () => {
      const nextEnabled = !paginationEnabled;

      setPaginationEnabled(nextEnabled);
      setCurrentPage(0);

      if (typeof window !== "undefined") {
        setPageInLocation(0);
      }
    },
    [paginationEnabled, setCurrentPage, setPaginationEnabled, setPageInLocation]
  );

  useEffect(() => {
    if (!paginationEnabled || typeof window === "undefined") {
      return undefined;
    }

    const syncPageFromUrl = () => {
      const nextPage = getPageFromSearch(window.location.search);
      const safe = clampPage(nextPage, maxPage);
      setCurrentPage(safe);
    };

    syncPageFromUrl();
    window.addEventListener("popstate", syncPageFromUrl);

    return () => {
      window.removeEventListener("popstate", syncPageFromUrl);
    };
  }, [paginationEnabled, maxPage, setCurrentPage]);

  useEffect(() => {
    if (!paginationEnabled || typeof window === "undefined") {
      return undefined;
    }

    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }

    if (total > 0) {
      setPageInLocation(safePage);
    }
  }, [paginationEnabled, currentPage, safePage, setCurrentPage, total]);

  const start = total === 0 ? 0 : safePage * safePageSize + 1;
  const end =
    total === 0 ? 0 : Math.min((safePage + 1) * safePageSize, total);

  return {
    handlePaginationToggle: handlePaginationToggleCallback,
    maxPage,
    safePage,
    start,
    end,
  };
}
