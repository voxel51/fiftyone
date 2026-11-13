import { useCallback } from "react";
import { useRecoilState, useRecoilValueLoadable } from "recoil";
import {
  EVENTS_FIELD,
  eventIdentity,
  parseEventIdentity,
} from "./event-facets/identity";
import { aggregationQuery } from "./recoil/aggregations";
import { filter } from "./recoil/filters";

/** Whether a virtual path supplies flat categorical values for the sidebar. */
export function isSidebarFacet(path: string): boolean {
  return path === EVENTS_FIELD;
}

/** A backend facet adapted to the sidebar's ordinary categorical rows. */
export function useSidebarFacet(modal: boolean, path: string, offset: number) {
  const [current, setCurrent] = useRecoilState(filter({ modal, path }));
  const result = useRecoilValueLoadable(
    aggregationQuery({
      modal,
      extended: true,
      paths: [path],
      eventOffset: offset,
    }),
  );
  const data =
    result.state === "hasValue"
      ? result.contents?.find(
          (entry) =>
            entry.path === path && entry.__typename === "EventAggregation",
        )
      : undefined;
  const selected = Array.isArray(current?.values)
    ? current.values.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const toggle = useCallback(
    (value: string, checked: boolean) => {
      setCurrent((previous) => {
        const values = new Set(
          Array.isArray(previous?.values) ? previous.values : [],
        );
        if (checked) values.add(value);
        else values.delete(value);
        return values.size ? { values: [...values], exclude: false } : null;
      });
    },
    [setCurrent],
  );
  const values: { value: string; label: string; count?: number }[] =
    data?.__typename === "EventAggregation"
      ? data.events.map((event) => ({
          value: eventIdentity(event),
          label: event.label,
          count: event.count,
        }))
      : [];
  // Keep selections removable outside the current page or view.
  const missing = selected.filter(
    (value) => !values.some((row) => row.value === value),
  );
  values.unshift(
    ...missing.map((value) => {
      const event = parseEventIdentity(value);
      return {
        value,
        label: event ? `${event.projection}/${event.id}` : value,
      };
    }),
  );
  return {
    values,
    total: data?.__typename === "EventAggregation" ? data.total : 0,
    pageSize: 200,
    loading: result.state === "loading",
    error: result.state === "hasError" ? "Values could not be loaded" : null,
    selected,
    toggle,
    clear: useCallback(() => setCurrent(null), [setCurrent]),
  };
}
