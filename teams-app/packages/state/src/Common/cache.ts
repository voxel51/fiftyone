import { atom } from "recoil";

export const staleCacheStore = atom<Set<string>>({
  key: "staleCacheStore",
  default: new Set(),
});

export const DATASET_SHARE_MODAL_INFO_CACHE_KEY =
  "DATASET_SHARE_MODAL_INFO_CACHE_KEY";

export const DATASET_SHARE_MODAL_GROUP_COUNT_CACHE_KEY =
  "DATASET_SHARE_MODAL_GROUP_COUNT_CACHE_KEY";

export const CLOUD_STORAGE_CREDENTIALS_CACHE_KEY =
  "CLOUD_STORAGE_CREDENTIALS_CACHE_KEY";

export const SNAPSHOT_BANNER_QUERY_CACHE_KEY =
  "SNAPSHOT_BANNER_QUERY_CACHE_KEY";

export const USER_LIMITS_CACHE_KEY = "USER_LIMITS_CACHE_KEY";
