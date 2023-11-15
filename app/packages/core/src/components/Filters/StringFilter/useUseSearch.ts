import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { stringSearch, stringSearchResults } from "./state";

export default function ({ modal, path }: { modal: boolean; path: string }) {
  return (search: string) => {
    const { count, values } = useRecoilValue(
      stringSearchResults({ modal, path })
    );

    const setSearch = useSetRecoilState(stringSearch({ modal, path }));

    useEffect(() => {
      setSearch(search);
    }, [search, setSearch]);

    return {
      values,
      total: count,
    };
  };
}
