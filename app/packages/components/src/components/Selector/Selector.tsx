import { AnimatePresence, motion } from "framer-motion";
import React, {
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Input from "react-input-autosize";
import { UseLayerOptions, useLayer } from "react-laag";
import LoadingDots from "../Loading/LoadingDots";

import Results from "../Results/Results";

import style from "./Selector.module.css";

interface UseSearch<T extends unknown> {
  (search: string): { values: T[]; total?: number };
}

type Props<T> = {
  active?: number;
  search: string;
  useSearch: UseSearch<T>;
  onSelect: (value: T) => void;
  onResults: (results: T[]) => void;
  component: React.FC<{ value: T; className: string }>;
  toKey?: (value: T) => string;
};

const SelectorResults = <T extends unknown>({
  active,
  onSelect,
  useSearch,
  search,
  onResults,
  component,
  toKey = (value) => String(value),
}: Props<T>) => {
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
  id?: string;
  value?: string;
  onSelect: (value: T) => void;
  placeholder: string;
  useSearch: UseSearch<T>;
  component: React.FC<{ value: T; className: string }>;
  toKey?: (value: T) => string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  resultsPlacement?: UseLayerOptions["placement"];
  overflow?: boolean;
  onMouseEnter?: React.MouseEventHandler;
}

const Selector = <T extends unknown>(props: SelectorProps<T>) => {
  const {
    id,
    value,
    onSelect,
    placeholder,
    useSearch,
    component,
    toKey = (value) => String(value),
    inputStyle,
    inputClassName,
    containerStyle,
    resultsPlacement,
    overflow = false,
    onMouseEnter,
    ...otherProps
  } = props;

  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const valuesRef = useRef<T[]>([]);
  const [active, setActive] = useState<number>();
  const ref = useRef<HTMLInputElement | null>(null);
  const hovering = useRef(false);

  const onSelectWrapper = useMemo(() => {
    return (value: T) => {
      onSelect(value);
      setEditing(false);
    };
  }, [onSelect]);

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
    overflowContainer: true,
    auto: true,
    snap: true,
    placement: resultsPlacement ? resultsPlacement : "bottom-center",
    possiblePlacements: resultsPlacement
      ? [resultsPlacement]
      : ["bottom-center"],
    triggerOffset: 8,
  });

  return (
    <div
      {...otherProps}
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
        data-cy={`selector-${placeholder}`}
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
            found >= 0 && onSelectWrapper(valuesRef.current[found]);
            active !== undefined && onSelectWrapper(valuesRef.current[active]);
          }
        }}
        onKeyDown={(e) => {
          const length = valuesRef.current.length;
          switch (e.key) {
            case "Escape":
              editing && setEditing(false);
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
        onMouseEnter={onMouseEnter}
      />
      {renderLayer(
        editing && (
          <AnimatePresence>
            <motion.div
              className={style.resultsContainer}
              id={id}
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
              <Suspense fallback={<LoadingDots text="Loading" />}>
                <SelectorResults
                  active={active}
                  search={search}
                  useSearch={useSearch}
                  onSelect={(value) => {
                    onSelectWrapper(value);
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
