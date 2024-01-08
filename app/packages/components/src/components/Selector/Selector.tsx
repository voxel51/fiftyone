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
import SearchResults, { UseSearch } from "./SearchResults";
import style from "./Selector.module.css";

export interface SelectorProps<T> {
  id?: string;
  value?: string;
  onSelect: (search: string, v?: T) => Promise<string> | void;
  placeholder: string;
  useSearch?: UseSearch<T>;
  component?: React.FC<{ value: T; className?: string }>;
  toKey?: (value: T) => string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  containerStyle?: React.CSSProperties;
  resultsPlacement?: UseLayerOptions["placement"];
  overflow?: boolean;
  overflowContainer?: boolean;
  onMouseEnter?: React.MouseEventHandler;
  cy?: string;
  noResults?: string;
}

function Selector<T>(props: SelectorProps<T>) {
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
    overflowContainer = false,
    onMouseEnter,
    cy,
    noResults,
    ...otherProps
  } = props;

  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const valuesRef = useRef<T[]>([]);

  // active is an index in the values array, or "undefined" which is the unset
  // pivot between 0 and (length - 1)
  const [active, setActive] = useState<number | undefined>(undefined);
  const local = useRef(value || "");

  const onSelectWrapper = useMemo(() => {
    return async (search: string, useSearch?: boolean) => {
      const value =
        active !== undefined && !useSearch
          ? valuesRef.current[active]
          : valuesRef.current.find((v) => toKey(v) === search);

      const result = await onSelect(value ? toKey(value) : search, value);
      if (result !== undefined) {
        local.current = result;
      }
      setEditing(false);
    };
  }, [active, onSelect, toKey, valuesRef]);

  useLayoutEffect(() => {
    setSearch(value || "");
    local.current = value || "";
  }, [value]);

  const ref = useRef<HTMLInputElement | null>();
  const hovering = useRef(false);

  useLayoutEffect(() => {
    if (!editing) {
      document.activeElement === ref.current && ref.current?.blur();
      setActive(undefined);
    } else {
      setSearch("");
    }
  }, [editing]);

  const onResults = useCallback((results: T[]) => {
    valuesRef.current = results;
  }, []);

  const { renderLayer, triggerProps, layerProps, triggerBounds } = useLayer({
    isOpen: Boolean(useSearch && editing),
    overflowContainer,
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
          useSearch && triggerProps.ref(node);
        }}
        className={style.input}
        value={editing ? search : local.current}
        placeholder={placeholder}
        data-cy={`selector-${cy || placeholder}`}
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
          setActive(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSelectWrapper(search);
            return;
          }
          switch (e.key) {
            case "Escape":
              editing && setEditing(false);
              break;
            case "ArrowDown":
              setActive(down(active, valuesRef.current.length));
              break;
            case "ArrowUp":
              setActive(up(active, valuesRef.current.length));
              break;
          }
        }}
        onMouseEnter={onMouseEnter}
      />
      {useSearch &&
        component &&
        onResults &&
        renderLayer(
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
                <Suspense
                  fallback={
                    <LoadingDots style={{ float: "right" }} text="Loading" />
                  }
                >
                  <SearchResults
                    active={active}
                    noResults={noResults}
                    search={search}
                    useSearch={useSearch}
                    onSelect={(value) => onSelectWrapper(toKey(value), true)}
                    component={component}
                    onResults={onResults}
                    toKey={toKey}
                    cy={cy}
                  />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          )
        )}
    </div>
  );
}

const down = (active: number | undefined, length: number) => {
  if (active === length - 1) {
    return undefined; // we are at the end, go to pivot
  }

  return Math.min((active ?? -1) + 1, length - 1);
};

const up = (active: number | undefined, length: number) => {
  if (active === undefined) {
    return length - 1; // go to end
  }

  if (active === 0) {
    return undefined; // return to pivot
  }

  return Math.max(active - 1, 0);
};

export default Selector;
