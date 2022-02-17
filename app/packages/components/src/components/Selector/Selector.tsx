import React, { PropsWithChildren, useRef, useState } from "react";
import Input from "react-input-autosize";

import style from "./Selector.module.css";

interface Props {
  value: string | null;
  values: string[] | null;
  onSelect: (value: string) => void;
  placeholder: string;
}

const toString = (value: unknown): string => {
  return value !== undefined && value !== null ? String(value) : "";
};

const Selector: React.FC<Props> = ({
  value = null,
  values,
  onSelect,
  placeholder,
}) => {
  const stringValue = toString(value);
  const [index, setIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(() => stringValue);
  const ref = useRef<HTMLInputElement | null>();

  return (
    <div className={style.container} title={local.length ? local : placeholder}>
      <Input
        inputRef={(node) => (ref.current = node)}
        className={style.input}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={() => setLocal(local)}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            values?.includes(value) && onSelect(value);
          }
        }}
        onKeyDown={(e) => {
          switch (e.key) {
            case "Escape":
              ref.current && ref.current.blur();
              break;
            case "ArrowDown":
              break;
            case "ArrowUp":
              break;
            case "ArrowRight":
              break;
          }
        }}
      />
    </div>
  );
};

export default Selector;
