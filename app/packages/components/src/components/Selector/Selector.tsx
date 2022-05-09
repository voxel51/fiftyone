import { motion, AnimatePresence } from "framer-motion";
import React, { useLayoutEffect, useRef, useState } from "react";
import { useCallback } from "react";
import { Suspense } from "react";
import Input from "react-input-autosize";
import { useLayer } from "react-laag";

import Results, { container, footer } from "../Results/Results";

import style from "./Selector.module.css";

interface UseSearch<T extends unknown> {
  (search: string): { values: T[]; total: number };
}

const SelectorResults = <T extends unknown>({
  active,
  onSelect,
  useSearch,
  search,
  onResults,
  component,
  toKey = (value) => String(value),
}: {
  active?: number;
  search: string;
  useSearch: UseSearch<T>;
  onSelect: (value: T) => void;
  onResults: (results: T[]) => void;
  component: React.FC<{ value: T; className: string }>;
  toKey?: (value: T) => string;
}) => {
  const { values, total } = useSearch(search);

  useLayoutEffect(() => {
    onResults(values);
  }, [values, onResults]);

  return (
    <Results
      toKey={toKey}
      active={active}
      component={component}
      results={values}
      onSelect={onSelect}
      total={total}
    />
  );
};

export interface SelectorProps<T> {
  value?: string;
  onSelect: (value: T) => void;
  placeholder: string;
  useSearch: UseSearch<T>;
  component: React.FC<{ value: T; className: string }>;
  toKey?: (value: T) => string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  overflow?: boolean;
}

const Selector = <T extends unknown>({
  value,
  onSelect,
  placeholder,
  useSearch,
  component,
  toKey = (value) => String(value),
  inputStyle,
  inputClassName,
  containerStyle,
  overflow = false,
}: SelectorProps<T>) => {
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const valuesRef = useRef<T[]>([]);
  const [active, setActive] = useState<number>();

  const ref = useRef<HTMLInputElement | null>();
  const hovering = useRef(false);

  useLayoutEffect(() => {
    if (!editing) {
      document.activeElement === ref.current && ref.current?.blur();
    } else {
      setSearch("");
      setActive(undefined);
    }
  }, [editing]);

  const onResults = useCallback((results) => {
    valuesRef.current = results;
    setActive(results.length ? 0 : undefined);
  }, []);

  const { renderLayer, triggerProps, layerProps, triggerBounds } = useLayer({
    isOpen: editing,
    overflowContainer: false,
    auto: true,
    snap: true,
    placement: "bottom-center",
    possiblePlacements: ["bottom-center"],
    triggerOffset: 8,
  });

  return (
    <div
      onMouseEnter={() => {
        hovering.current = true;
      }}
      onMouseLeave={() => {
        hovering.current = false;
      }}
      className={style.container}
      style={containerStyle}
      title={editing && search.length ? search : placeholder}
    >
      <Input
        inputStyle={editing ? { ...inputStyle } : inputStyle}
        inputClassName={inputClassName}
        spellCheck={false}
        inputRef={(node) => {
          ref.current = node;
          triggerProps.ref(node);
        }}
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
            const found = valuesRef.current
              .map((v) => toKey(v))
              .indexOf(search);
            found >= 0 && onSelect(valuesRef.current[found]);
            active !== undefined && onSelect(valuesRef.current[active]);
            setEditing(false);
          }
        }}
        onKeyDown={(e) => {
          const length = valuesRef.current.length;
          switch (e.key) {
            case "Escape":
              ref.current && ref.current.blur();
              break;
            case "ArrowDown":
              active !== undefined &&
                setActive(Math.min(active + 1, length - 1));
              break;
            case "ArrowUp":
              active !== undefined && setActive(Math.max(active - 1, 0));
              break;
          }
        }}
      />
      {renderLayer(
        editing && (
          <AnimatePresence>
            <motion.div
              className={container}
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: 1,
                height: "auto",
              }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              key={"results"}
              {...layerProps}
              style={{
                ...layerProps.style,
                width: overflow ? "auto" : triggerBounds?.width,
                minWidth: triggerBounds?.width,
              }}
            >
              <Suspense fallback={<div className={footer}>Loading...</div>}>
                <SelectorResults
                  active={active}
                  search={search}
                  useSearch={useSearch}
                  onSelect={(value) => {
                    setEditing(false);
                    onSelect(value);
                  }}
                  component={component}
                  onResults={onResults}
                  toKey={toKey}
                />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        )
      )}
    </div>
  );
};

export default Selector;
