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

const clampPage = (page: number, maxPage: number) =>
  Math.max(0, Math.min(page, maxPage));

const getPageFromSearch = (search: string) => {
  const value = new URLSearchParams(search).get(GRID_PAGE_PARAM);
  const page = Number.parseInt(value ?? "", 10);

  return Number.isFinite(page) && page > 0 ? page - 1 : 0;
};

const setPageInLocation = (page: number) => {
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
};

export default function usePagination({
  paginationEnabled,
  setPaginationEnabled,
  currentPage,
  setCurrentPage,
  total,
  pageSize,
}: UsePaginationOptions): UsePaginationResult {
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const safePage = clampPage(currentPage, maxPage);

  const handlePaginationToggle = useCallback(() => {
    const nextEnabled = !paginationEnabled;

    setPaginationEnabled(nextEnabled);
    setCurrentPage(0);

    if (typeof window !== "undefined") {
      setPageInLocation(0);
    }
  }, [paginationEnabled, setCurrentPage, setPaginationEnabled]);

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

    setPageInLocation(safePage);
  }, [paginationEnabled, currentPage, safePage, setCurrentPage]);

  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end =
    total === 0 ? 0 : Math.min((safePage + 1) * pageSize, total);

  return {
    handlePaginationToggle,
    maxPage,
    safePage,
    start,
    end,
  };
}
