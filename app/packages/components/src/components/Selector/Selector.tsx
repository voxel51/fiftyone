import { motion, AnimatePresence } from "framer-motion";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useCallback } from "react";
import { Suspense } from "react";
import Input from "react-input-autosize";

import Results, { container, footer } from "../Results/Results";

import style from "./Selector.module.css";

interface UseSearch {
  (search: string): { values: string[]; total: number };
}

const SelectorResults: React.FC<{
  active?: string;
  search: string;
  useSearch: UseSearch;
  onSelect: (value: string) => void;
  onResults: (results: string[]) => void;
  component: React.FC<{ value: string; className: string }>;
}> = ({ active, onSelect, useSearch, search, onResults, component }) => {
  const { values, total } = useSearch(search);

  useLayoutEffect(() => {
    onResults(values);
  }, [values, onResults]);

  return (
    <Results
      active={active}
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
  const [active, setActive] = useState<string>();

  const ref = useRef<HTMLInputElement | null>();
  const hovering = useRef(false);

  useLayoutEffect(() => {
    if (!editing) {
      document.activeElement === ref.current && ref.current?.blur();
      setSearch("");
      setActive(undefined);
    }
  }, [editing]);

  const onResults = useCallback((results) => {
    valuesRef.current = results;
    setActive(results[0] || undefined);
  }, []);

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
            active && onSelect(active);
            setEditing(false);
          }
        }}
        onKeyDown={(e) => {
          const index = active ? valuesRef.current.indexOf(active) : 0;
          const length = valuesRef.current.length;
          switch (e.key) {
            case "Escape":
              ref.current && ref.current.blur();
              break;
            case "ArrowDown":
              setActive(valuesRef.current[Math.min(index + 1, length - 1)]);
              break;
            case "ArrowUp":
              setActive(valuesRef.current[Math.max(index - 1, 0)]);
              break;
          }
        }}
      />
      <AnimatePresence>
        {editing && (
          <motion.div
            className={container}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            key={"results"}
          >
            <Suspense fallback={<div className={footer}>Loading...</div>}>
              <SelectorResults
                active={active}
                search={search}
                useSearch={useSearch}
                onSelect={(value) => {
                  setEditing(false);
                }}
                component={component}
                onResults={onResults}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Selector;
