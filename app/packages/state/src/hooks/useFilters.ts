import { useRecoilValue } from "recoil";
import { filters } from "../recoil/filters";

export default function useFilters() {
  return useRecoilValue(filters);
}
