import { useDebounceCallback } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { stringSearch, stringSearchResults } from "./state";

const DEBOUNCE_DELAY = 200;

export default function ({ modal, path }: { modal: boolean; path: string }) {
  return (search: string) => {
    const { count, values } = useRecoilValue(
      stringSearchResults({ modal, path }),
    );

    const setSearch = useSetRecoilState(stringSearch({ modal, path }));
    const debouncedSetSearch = useDebounceCallback(setSearch, DEBOUNCE_DELAY);

    useEffect(() => {
      debouncedSetSearch(search);
    }, [search, debouncedSetSearch]);

    return {
      values,
      total: count,
    };
  };
}
