import React, { useLayoutEffect, useRef, useState } from "react";
import { Suspense } from "react";
import Input from "react-input-autosize";
import Results from "../Results/Results";

import style from "./Selector.module.css";

interface UseSearch {
  (search: string): { values: string[]; total: number };
}

const SelectorResults: React.FC<{
  search: string;
  useSearch: UseSearch;
  onSelect: (value: string) => void;
  onResults: (results: string[]) => void;
  component: React.FC<{ value: T; className: string }>;
}> = ({ onSelect, useSearch, search, onResults, component }) => {
  const { values, total } = useSearch(search);

  useLayoutEffect(() => {
    onResults(values);
  }, [values, onResults]);

  return (
    <Results
      component={component}
      results={values.map((value) => ({
        name: value,
      }))}
      onSelect={onSelect}
      total={total}
    />
  );
};

export interface SelectorProps {
  value: string;
  onSelect: (value: string) => void;
  placeholder: string;
  useSearch: UseSearch;
  component: React.FC<{ value: T; className: string }>;
}

const Selector: React.FC<SelectorProps> = ({
  value = null,
  onSelect,
  placeholder,
  useSearch,
  component,
}) => {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const valuesRef = useRef<string[]>([]);

  const ref = useRef<HTMLInputElement | null>();
  const hovering = useRef(false);

  useLayoutEffect(() => {
    if (!editing) {
      document.activeElement === ref.current && ref.current?.blur();
      setSearch("");
    }
  }, [editing]);

  return (
    <div
      onMouseEnter={() => {
        hovering.current = true;
      }}
      onMouseLeave={() => {
        hovering.current = false;
      }}
      className={style.container}
      title={editing && search.length ? search : placeholder}
    >
      <Input
        style={editing ? { minWidth: 108 } : {}}
        spellCheck={false}
        inputRef={(node) => (ref.current = node)}
        className={style.input}
        value={editing ? search : value || ""}
        placeholder={placeholder}
        onFocus={() => setEditing(true)}
        onBlur={(e) => {
          if (!editing) return;

          if (hovering.current) {
            e.preventDefault();
            e.target.focus();
            return;
          }

          setEditing(false);
        }}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            valuesRef.current.includes(search) && onSelect(search);
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
      {editing && (
        <Suspense fallback={null}>
          <SelectorResults
            search={search}
            useSearch={useSearch}
            onSelect={(value) => {
              onSelect(value);
              setEditing(false);
            }}
            component={component}
            onResults={(results) => (valuesRef.current = results)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Selector;
