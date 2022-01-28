import React, { useState } from "react";
import { useDebounce } from "react-use";
import { useRecoilState } from "recoil";
import { textFilter } from "../recoil";
import { InputDiv } from "./utils";

const Filter = ({ modal }: { modal: boolean }) => {
  const [debouncedValue, setDebouncedValue] = useRecoilState(textFilter(modal));
  const [value, setValue] = useState(() => debouncedValue);

  useDebounce(
    () => {
      setDebouncedValue(value);
    },
    200,
    [value]
  );
  return (
    <InputDiv>
      <input
        type={"text"}
        placeholder={"Filter"}
        value={value}
        maxLength={140}
        onChange={({ target }) => {
          setValue(target.value);
        }}
      />
    </InputDiv>
  );
};

export default React.memo(Filter);
