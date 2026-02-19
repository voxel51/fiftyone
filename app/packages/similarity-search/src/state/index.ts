import { atom } from "jotai";
import { SimilarityRun, BrainKeyConfig, CloneConfig } from "../types";

const runs = atom<SimilarityRun[]>([]);
const brainKeys = atom<BrainKeyConfig[]>([]);
const cloneConfig = atom<CloneConfig | null>(null);

export default { runs, brainKeys, cloneConfig };
