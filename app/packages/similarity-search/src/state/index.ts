import { atom } from "jotai";
import {
  SimilarityRun,
  BrainKeyConfig,
  CloneConfig,
  RunFilterState,
} from "../types";

const runs = atom<SimilarityRun[]>([]);
const brainKeys = atom<BrainKeyConfig[]>([]);
const cloneConfig = atom<CloneConfig | null>(null);

const filterState = atom<RunFilterState>({
  searchText: "",
  datePreset: "all",
});
const selectMode = atom<boolean>(false);
const selectedRunIds = atom<Set<string>>(new Set());

export default {
  runs,
  brainKeys,
  cloneConfig,
  filterState,
  selectMode,
  selectedRunIds,
};
