export const QP_WAIT = 5151;

export type QueryPerformanceDetail = {
  path: string;
  isFrameField: boolean;
};

/** A query on `path` ran long enough that an index or summary field helps */
export type QueryPerformanceEvents = {
  "query-performance:slow": QueryPerformanceDetail;
};
