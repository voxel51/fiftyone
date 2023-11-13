import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { categoricalSearch, categoricalSearchResults } from "./state";

export default function ({ modal, path }: { modal: boolean; path: string }) {
  return (search: string) => {
    const { count, values } = useRecoilValue(
      categoricalSearchResults({ modal, path })
    );

    const setSearch = useSetRecoilState(categoricalSearch({ modal, path }));

    useEffect(() => {
      setSearch(search);
    }, [search, setSearch]);

    return {
      values,
      total: count,
    };
  };
}
