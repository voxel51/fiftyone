import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CameraControlOption, filterCameraControlOptions } from "./utils";

type CameraAutocompleteProps = {
  options: CameraControlOption[];
  selectedCameraKey: string | null;
  onSelect: (cameraKey: string) => void;
};

const styles = {
  container: {
    position: "relative",
    width: "100%",
  } as const,
  input: {
    width: "100%",
    border: "1px solid var(--leva-colors-elevation3)",
    borderRadius: "4px",
    background: "var(--leva-colors-elevation2)",
    color: "var(--leva-colors-highlight3)",
    fontSize: "11px",
    lineHeight: "18px",
    padding: "4px 8px",
    boxSizing: "border-box",
  } as const,
  list: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    maxHeight: "180px",
    overflowY: "auto",
    border: "1px solid var(--leva-colors-elevation3)",
    borderRadius: "4px",
    background: "var(--leva-colors-elevation2)",
    zIndex: 20,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
  } as const,
  option: {
    display: "block",
    width: "100%",
    border: "none",
    textAlign: "left",
    padding: "6px 8px",
    background: "transparent",
    color: "var(--leva-colors-highlight3)",
    cursor: "pointer",
    fontSize: "11px",
  } as const,
  optionActive: {
    background: "var(--leva-colors-accent1)",
    color: "var(--leva-colors-elevation1)",
  } as const,
  optionSelected: {
    fontWeight: 600,
  } as const,
  noMatch: {
    padding: "6px 8px",
    fontSize: "11px",
    color: "var(--leva-colors-highlight1)",
  } as const,
} as const;

export const CameraAutocomplete = ({
  options,
  selectedCameraKey,
  onSelect,
}: CameraAutocompleteProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownDirection, setDropdownDirection] = useState<"up" | "down">(
    "down"
  );

  const selectedOption = useMemo(() => {
    if (!selectedCameraKey) {
      return null;
    }

    return options.find((option) => option.key === selectedCameraKey) ?? null;
  }, [options, selectedCameraKey]);

  // This effect syncs the input text with the selected option label when the dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setSearchValue(selectedOption?.label ?? "");
    }
  }, [isOpen, selectedOption?.label]);

  // This effect closes the dropdown when clicking outside the container
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && containerRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, selectedOption?.label]);

  const filteredOptions = useMemo(
    () => filterCameraControlOptions(options, searchValue),
    [options, searchValue]
  );

  // This effect determines whether the dropdown opens upward or downward based on available viewport space
  useEffect(() => {
    if (!isOpen || !containerRef.current) {
      return;
    }

    const updateDirection = () => {
      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const listHeight = 180;

      if (spaceBelow < listHeight && spaceAbove > spaceBelow) {
        setDropdownDirection("up");
        return;
      }

      setDropdownDirection("down");
    };

    updateDirection();

    window.addEventListener("resize", updateDirection);
    window.addEventListener("scroll", updateDirection, true);
    return () => {
      window.removeEventListener("resize", updateDirection);
      window.removeEventListener("scroll", updateDirection, true);
    };
  }, [isOpen]);

  // This effect clamps the active index so it stays within bounds when filtered options shrink
  useEffect(() => {
    if (filteredOptions.length === 0) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, filteredOptions.length - 1));
  }, [filteredOptions]);

  const scrollActiveIntoView = useCallback((index: number) => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const child = list.children[index] as HTMLElement | undefined;
    child?.scrollIntoView({ block: "nearest" });
  }, []);

  // This effect keeps keyboard-driven highlight visible in the dropdown list.
  useEffect(() => {
    if (!isOpen || filteredOptions.length === 0) {
      return;
    }

    scrollActiveIntoView(activeIndex);
  }, [activeIndex, filteredOptions.length, isOpen, scrollActiveIntoView]);

  const selectOption = (option: CameraControlOption) => {
    onSelect(option.key);
    setSearchValue(option.label);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <input
        type="text"
        value={searchValue}
        placeholder={
          selectedOption?.label ?? (options.length > 0 ? "Select camera" : "")
        }
        style={styles.input}
        onFocus={(event) => {
          setIsOpen(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setSearchValue(event.currentTarget.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) =>
              Math.min(current + 1, Math.max(filteredOptions.length - 1, 0))
            );
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => Math.max(current - 1, 0));
            return;
          }

          if (event.key === "Enter") {
            if (!isOpen || filteredOptions.length === 0) {
              return;
            }

            event.preventDefault();
            selectOption(filteredOptions[activeIndex] ?? filteredOptions[0]);
            return;
          }

          if (event.key === "Escape") {
            setIsOpen(false);
            setSearchValue(selectedOption?.label ?? "");
          }
        }}
      />

      {isOpen && (
        <div
          ref={listRef}
          style={{
            ...styles.list,
            ...(dropdownDirection === "up"
              ? { top: "auto", bottom: "calc(100% + 4px)" }
              : { top: "calc(100% + 4px)", bottom: "auto" }),
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={styles.noMatch}>No matches</div>
          ) : (
            filteredOptions.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = option.key === selectedCameraKey;

              return (
                <button
                  key={option.key}
                  type="button"
                  style={{
                    ...styles.option,
                    ...(isActive ? styles.optionActive : null),
                    ...(isSelected ? styles.optionSelected : null),
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  onClick={() => {
                    selectOption(option);
                  }}
                >
                  {option.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
