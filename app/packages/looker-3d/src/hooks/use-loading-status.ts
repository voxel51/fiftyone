import { useRecoilValue } from "recoil";
import { fo3dLoadingStatusThisSample } from "../state";
import { LoadingStatus } from "../types";

/**
 * Custom hook to easily access and work with the loading status
 */
export const useLoadingStatus = () => {
  const loadingStatus = useRecoilValue(fo3dLoadingStatusThisSample);

  return {
    /** The current loading status */
    status: loadingStatus.status,

    /** Whether loading is currently in progress */
    isLoading:
      loadingStatus.status === LoadingStatus.STARTED ||
      loadingStatus.status === LoadingStatus.LOADING,

    /** Whether loading has completed successfully */
    isSuccess: loadingStatus.status === LoadingStatus.SUCCESS,

    /** Whether loading has failed */
    isFailed: loadingStatus.status === LoadingStatus.FAILED,

    /** Whether loading is idle (not started) */
    isIdle: loadingStatus.status === LoadingStatus.IDLE,

    /** Whether loading was aborted */
    isAborted: loadingStatus.status === LoadingStatus.ABORTED,

    /** Current progress percentage (0-100) */
    progress: loadingStatus.progress || 0,

    /** Number of items loaded */
    itemsLoaded: loadingStatus.itemsLoaded || 0,

    /** Total number of items to load */
    itemsTotal: loadingStatus.itemsTotal || 0,

    /** Current URL being loaded */
    currentUrl: loadingStatus.currentUrl,

    /** Error message if loading failed */
    errorMessage: loadingStatus.errorMessage,

    /** Timestamp when status was last updated */
    timestamp: loadingStatus.timestamp,

    /** Full loading status object */
    fullStatus: loadingStatus,
  };
};
