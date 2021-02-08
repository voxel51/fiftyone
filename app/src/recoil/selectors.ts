import { selector, selectorFamily } from "recoil";
import ReconnectingWebSocket from "reconnecting-websocket";
import uuid from "uuid-v4";

import * as atoms from "./atoms";
import { generateColorMap } from "../utils/colors";
import { isElectron } from "../utils/generic";
import {
  RESERVED_FIELDS,
  STRING_FIELD,
  VALID_LABEL_TYPES,
  VALID_LIST_TYPES,
  VALID_NUMERIC_TYPES,
  VALID_SCALAR_TYPES,
  makeLabelNameGroups,
  labelTypeHasColor,
} from "../utils/labels";
import { packageMessage } from "../utils/socket";
import { viewsAreEqual } from "../utils/view";
import { lightTheme } from "../shared/colors";

class HTTPSSocket {
  location: string;
  events: {
    [name: string]: Set<(data: object) => void>;
  } = {};
  readyState: number = WebSocket.CONNECTING;
  openTimeout: number = 2000;
  timeout: number = 2000;
  interval: number;

  constructor(location: string) {
    this.location = location;
    this.connect();
  }

  connect() {
    this.gather();
    this.interval = setInterval(() => this.gather(), this.timeout);
  }

  execute(messages) {
    if ([WebSocket.CLOSED, WebSocket.CONNECTING].includes(this.readyState)) {
      this.events.open.forEach((h) => h(null));
      this.timeout = this.openTimeout;
      clearInterval(this.interval);
      this.interval = setInterval(() => this.gather(), this.timeout);
    }
    this.readyState = WebSocket.OPEN;
    messages.forEach((m) => {
      fetch(this.location + "&mode=pull", {
        method: "post",
        body: JSON.stringify(m),
      })
        .then((response) => response.json())
        .then((data) => {
          this.events.message.forEach((h) => h({ data: JSON.stringify(data) }));
        });
    });
  }

  gather() {
    fetch(this.location)
      .then((response) => response.json())
      .then(({ messages }) => this.execute(messages))
      .catch(() => {
        if (this.readyState === WebSocket.OPEN && this.events.close) {
          this.events.close.forEach((h) => h(null));
        }
        this.readyState = WebSocket.CLOSED;
        clearInterval(this.interval);
        this.timeout = Math.min(this.timeout * 2, 5000);
        this.interval = setInterval(() => this.gather(), this.timeout);
      });
  }

  addEventListener(eventType, handler) {
    if (!this.events[eventType]) {
      this.events[eventType] = new Set();
    }
    this.events[eventType].add(handler);
  }

  removeEventListener(eventType, handler) {
    this.events[eventType].delete(handler);
  }

  send(message) {
    fetch(this.location + "&mode=push", {
      method: "post",
      body: message,
    })
      .then((response) => response.json())
      .then((data) => {
        const { messages, type } = data;
        messages && this.execute(messages);
        type &&
          this.events.message.forEach((h) => h({ data: JSON.stringify(data) }));
      });
  }
}

export const sessionId = uuid();

export const handleId = selector({
  key: "handleId",
  get: () => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return params.get("handleId");
  },
});

export const deactivated = selector({
  key: "deactivated",
  get: ({ get }) => {
    const handle = get(handleId);
    const activeHandle = get(atoms.stateDescription)?.active_handle;
    const notebook = get(isNotebook);
    if (notebook) {
      return handle !== activeHandle && typeof activeHandle === "string";
    }
    return false;
  },
});

const host =
  process.env.NODE_ENV === "development"
    ? "localhost:5151"
    : window.location.host;

export const port = selector({
  key: "port",
  get: ({ get }) => {
    if (isElectron()) {
      return parseInt(process.env.FIFTYONE_SERVER_PORT) || 5151;
    }
    return parseInt(window.location.port);
  },
});

export const http = selector({
  key: "http",
  get: ({ get }) => {
    if (isElectron()) {
      return `http://localhost:${get(port)}`;
    } else {
      const loc = window.location;
      return loc.protocol + "//" + host;
    }
  },
});

export const ws = selector({
  key: "ws",
  get: ({ get }) => {
    if (isElectron()) {
      return `ws://localhost:${get(port)}/state`;
    }
    let url = null;
    const loc = window.location;
    if (loc.protocol === "https:") {
      url = "wss:";
    } else {
      url = "ws:";
    }
    return url + "//" + host + "/state";
  },
});

export const fiftyone = selector({
  key: "fiftyone",
  get: async ({ get }) => {
    let response = null;
    do {
      try {
        response = await fetch(`${get(http)}/fiftyone`);
      } catch {}
      if (response) break;
      await new Promise((r) => setTimeout(r, 2000));
    } while (response === null);
    const data = await response.json();
    return data;
  },
});

export const showFeedbackButton = selector({
  key: "showFeedbackButton",
  get: ({ get }) => {
    const feedback = get(fiftyone).feedback;
    const localFeedback = get(atoms.feedbackSubmitted);
    const storedFeedback = window.localStorage.getItem("fiftyone-feedback");
    if (storedFeedback) {
      window.localStorage.removeItem("fiftyone-feedback");
      fetch(`${get(http)}/feedback?submitted=true`, { method: "post" });
    }
    if (
      feedback.submitted ||
      localFeedback.submitted ||
      storedFeedback === "submitted"
    ) {
      return "hidden";
    }
    if (feedback.minimized || localFeedback.minimized) {
      return "minimized";
    }
    return "shown";
  },
});

export const isColab = selector({
  key: "isColab",
  get: () => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return params.get("fiftyoneColab");
  },
});

export const isNotebook = selector({
  key: "isNotebook",
  get: () => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return params.get("notebook");
  },
});

export const appContext = selector({
  key: "appContext",
  get: ({ get }) => {
    const electron = isElectron();
    const notebook = get(isNotebook);
    const colab = get(isNotebook);
    if (electron) {
      return "desktop";
    }
    if (colab) {
      return "colab";
    }
    if (notebook) {
      return "notebook";
    }
    return "browser";
  },
});

export const socket = selector({
  key: "socket",
  get: ({ get }): ReconnectingWebSocket | HTTPSSocket => {
    if (get(isColab)) {
      return new HTTPSSocket(`${get(http)}/polling?sessionId=${sessionId}`);
    } else {
      return new ReconnectingWebSocket(get(ws));
    }
  },
  dangerouslyAllowMutability: true,
});

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset ? stateDescription.dataset.name : null;
  },
});

export const datasets = selector({
  key: "datasets",
  get: ({ get }) => {
    return get(atoms.stateDescription).datasets ?? [];
  },
});

export const hasDataset = selector({
  key: "hasDataset",
  get: ({ get }) => Boolean(get(datasetName)),
});

export const mediaType = selector({
  key: "mediaType",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset
      ? stateDescription.dataset.media_type
      : null;
  },
});

export const isVideoDataset = selector({
  key: "isVideoDataset",
  get: ({ get }) => {
    return get(mediaType) === "video";
  },
});

export const view = selector<[]>({
  key: "view",
  get: ({ get }) => {
    return get(atoms.stateDescription).view || [];
  },
  set: ({ get, set }, stages) => {
    const state = get(atoms.stateDescription);
    const newState = {
      ...state,
      view: stages,
    };
    set(atoms.stateDescription, newState);
    get(socket).send(packageMessage("update", { state: newState }));
  },
});

export const filterStages = selector({
  key: "filterStages",
  get: ({ get }) => {
    return get(atoms.stateDescription).filters;
  },
  set: ({ get, set }, filters) => {
    const state = {
      ...get(atoms.stateDescription),
      filters,
    };
    const sock = get(socket);
    sock.send(packageMessage("filters_update", { filters }));
    set(atoms.stateDescription, state);
  },
});

export const filterStage = selectorFamily({
  key: "filterStage",
  get: (path) => ({ get }) => {
    return get(filterStages)?.[path] ?? {};
  },
  set: (path: string) => ({ get, set }, value) => {
    const filters = Object.assign({}, get(filterStages));
    if (!value && !filters[path]) return;
    if (JSON.stringify(value) === JSON.stringify(filters[path])) return;
    if (!value && path in filters) {
      delete filters[path];
    } else {
      filters[path] = value;
    }
    set(filterStages, filters);
  },
});

export const paginatedFilterStages = selector({
  key: "paginatedFilterStages",
  get: ({ get }) => {
    const scalars = get(scalarNames("sample"));
    const filters = get(filterStages);
    return Object.keys(filters).reduce((acc, cur) => {
      if (scalars.includes(cur)) {
        acc[cur] = filters[cur];
      }
      return acc;
    }, {});
  },
});

export const datasetStats = selector({
  key: "datasetStats",
  get: ({ get }) => {
    const raw = get(atoms.datasetStatsRaw);
    const currentView = get(view);
    if (!raw.view) {
      return null;
    }
    if (viewsAreEqual(raw.view, currentView)) {
      return raw.stats;
    }
    return null;
  },
});

const normalizeFilters = (filters) => {
  const names = Object.keys(filters).sort();
  const list = names.map((n) => filters[n]);
  return JSON.stringify([names, list]);
};

const filtersAreEqual = (filtersOne, filtersTwo) => {
  return normalizeFilters(filtersOne) === normalizeFilters(filtersTwo);
};

export const extendedDatasetStats = selector({
  key: "extendedDatasetStats",
  get: ({ get }) => {
    const raw = get(atoms.extendedDatasetStatsRaw);
    const currentView = get(view);
    if (!raw.view) {
      return null;
    }
    if (!viewsAreEqual(raw.view, currentView)) {
      return null;
    }
    const currentFilters = get(filterStages);
    if (!filtersAreEqual(raw.filters, currentFilters)) {
      return null;
    }

    return raw.stats;
  },
});

export const totalCount = selector({
  key: "totalCount",
  get: ({ get }): number => {
    const stats = get(datasetStats) || [];
    return stats.reduce(
      (acc, cur) => (cur.name === null ? cur.result : acc),
      null
    );
  },
});

export const filteredCount = selector({
  key: "filteredCount",
  get: ({ get }): number => {
    const stats = get(extendedDatasetStats) || [];
    return stats.reduce(
      (acc, cur) => (cur.name === null ? cur.result : acc),
      null
    );
  },
});

export const tagNames = selector({
  key: "tagNames",
  get: ({ get }) => {
    return (get(datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === "tags") {
        return Object.keys(cur.result).sort();
      }
      return acc;
    }, []);
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    return (get(datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === "tags") {
        return cur.result;
      }
      return acc;
    }, {});
  },
});

export const filteredTagSampleCounts = selector({
  key: "filteredTagSampleCounts",
  get: ({ get }) => {
    return (get(datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === "tags") {
        return cur.result;
      }
      return acc;
    }, {});
  },
});

export const fieldSchema = selectorFamily({
  key: "fieldSchema",
  get: (dimension: string) => ({ get }) => {
    const d = get(atoms.stateDescription).dataset || {};
    return d[dimension + "_fields"] || [];
  },
});

const labelFilter = (f) => {
  return (
    f.embedded_doc_type &&
    VALID_LABEL_TYPES.includes(f.embedded_doc_type.split(".").slice(-1)[0])
  );
};

const scalarFilter = (f) => {
  return VALID_SCALAR_TYPES.includes(f.ftype);
};

const fields = selectorFamily({
  key: "fields",
  get: (dimension: string) => ({ get }) => {
    return get(fieldSchema(dimension)).reduce((acc, cur) => {
      acc[cur.name] = cur;
      return acc;
    }, {});
  },
});

const selectedFields = selectorFamily({
  key: "selectedFields",
  get: (dimension: string) => ({ get }) => {
    const view_ = get(view);
    const fields_ = { ...get(fields(dimension)) };
    const video = get(isVideoDataset);
    view_.forEach(({ _cls, kwargs }) => {
      if (_cls === "fiftyone.core.stages.SelectFields") {
        const supplied = kwargs[0][1] ? kwargs[0][1] : [];
        let names = new Set([...supplied, ...RESERVED_FIELDS]);
        if (video && dimension === "frame") {
          names = new Set(
            Array.from(names).map((n) => n.slice("frames.".length))
          );
        }
        Object.keys(fields_).forEach((f) => {
          if (!names.has(f)) {
            delete fields_[f];
          }
        });
      } else if (_cls === "fiftyone.core.stages.ExcludeFields") {
        const supplied = kwargs[0][1] ? kwargs[0][1] : [];
        let names = Array.from(supplied);

        if (video && dimension === "frame") {
          names = names.map((n) => n.slice("frames.".length));
        } else if (video) {
          names = names.filter((n) => n.startsWith("frames."));
        }
        names.forEach((n) => {
          delete fields_[n];
        });
      }
    });
    return fields_;
  },
});

export const defaultPlayerOverlayOptions = selector({
  key: "defaultPlayerOverlayOptions",
  get: ({ get }) => {
    const showAttrs = get(appConfig).show_attributes;
    const showConfidence = get(appConfig).show_confidence;
    return {
      showAttrs,
      showConfidence,
    };
  },
});

export const playerOverlayOptions = selector({
  key: "playerOverlayOptions",
  get: ({ get }) => {
    return {
      ...get(defaultPlayerOverlayOptions),
      ...get(atoms.savedPlayerOverlayOptions),
    };
  },
});

export const fieldPaths = selector({
  key: "fieldPaths",
  get: ({ get }) => {
    const excludePrivateFilter = (f) => !f.startsWith("_");
    const fieldsNames = Object.keys(get(selectedFields("sample"))).filter(
      excludePrivateFilter
    );
    if (get(mediaType) === "video") {
      return fieldsNames
        .concat(
          Object.keys(get(selectedFields("frame")))
            .filter(excludePrivateFilter)
            .map((f) => "frames." + f)
        )
        .sort();
    }
    return fieldsNames.sort();
  },
});

const labels = selectorFamily({
  key: "labels",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(selectedFields(dimension));
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(labelFilter);
  },
});

export const labelNames = selectorFamily({
  key: "labelNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(labels(dimension));
    return l.map((l) => l.name);
  },
});

export const labelPaths = selector({
  key: "labelPaths",
  get: ({ get }) => {
    const sampleLabels = get(labelNames("sample"));
    const frameLabels = get(labelNames("frame"));
    return sampleLabels.concat(frameLabels.map((l) => "frames." + l));
  },
});

export const labelTypes = selectorFamily({
  key: "labelTypes",
  get: (dimension: string) => ({ get }) => {
    return get(labels(dimension)).map((l) => {
      return l.embedded_doc_type.split(".").slice(-1)[0];
    });
  },
});

const scalars = selectorFamily({
  key: "scalars",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(selectedFields(dimension));
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(scalarFilter);
  },
});

export const scalarNames = selectorFamily({
  key: "scalarNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(scalars(dimension));
    return l.map((l) => l.name);
  },
});

export const scalarTypes = selectorFamily({
  key: "scalarTypes",
  get: (dimension: string) => ({ get }) => {
    const l = get(scalars(dimension));
    return l.map((l) => l.ftype);
  },
});

const COUNT_CLS = "Count";
const LABELS_CLS = "Distinct";
const BOUNDS_CLS = "Bounds";
const CONFIDENCE_BOUNDS_CLS = "Bounds";

export const labelsPath = selectorFamily({
  key: "labelsPath",
  get: (path: string) => ({ get }) => {
    const isVideo = get(isVideoDataset);
    const dimension =
      isVideo && path.startsWith("frames.") ? "frame" : "sample";
    const label = dimension === "frame" ? path.slice("frames.".length) : path;
    const type = get(labelMap(dimension))[label];
    if (VALID_LIST_TYPES.includes(type)) {
      return `${path}.${type.toLowerCase()}.label`;
    }
    return `${path}.label`;
  },
});

export const labelClasses = selectorFamily({
  key: "labelClasses",
  get: (label) => ({ get }) => {
    const path = get(labelsPath(label));
    return (get(datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === path && cur._CLS === LABELS_CLS) {
        return cur.result;
      }
      return acc;
    }, []);
  },
});

const catchLabelCount = (names, prefix, cur, acc) => {
  if (
    cur.name &&
    names.includes(cur.name.slice(prefix.length).split(".")[0]) &&
    cur._CLS === COUNT_CLS
  ) {
    acc[cur.name.slice(prefix.length).split(".")[0]] = cur.result;
  }
};

export const labelSampleCounts = selectorFamily({
  key: "labelSampleCounts",
  get: (dimension: string) => ({ get }) => {
    const names = get(labelNames(dimension)).concat(
      get(scalarNames(dimension))
    );
    const prefix = dimension === "sample" ? "" : "frames.";
    const stats = get(datasetStats);
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc);
      return acc;
    }, {});
  },
});

export const filteredLabelSampleCounts = selectorFamily({
  key: "filteredLabelSampleCounts",
  get: (dimension: string) => ({ get }) => {
    const names = get(labelNames(dimension)).concat(
      get(scalarNames(dimension))
    );
    const prefix = dimension === "sample" ? "" : "frames.";
    const stats = get(extendedDatasetStats);
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc);
      return acc;
    }, {});
  },
});

export const labelFilters = selector({
  key: "labelFilters",
  get: ({ get }) => {
    const frameLabels = get(atoms.activeLabels("frame"));
    const labels = {
      ...get(atoms.activeLabels("sample")),
      ...Object.keys(frameLabels).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
    const filters = {};
    for (const label in labels) {
      const range = get(filterLabelConfidenceRange(label));
      const none = get(filterLabelIncludeNoConfidence(label));
      const include = get(filterIncludeLabels(label));
      filters[label] = (s) => {
        const inRange =
          range[0] - 0.005 <= s.confidence && s.confidence <= range[1] + 0.005;
        const noConfidence = none && s.confidence === undefined;
        const isIncluded = include.length === 0 || include.includes(s.label);
        return (inRange || noConfidence) && isIncluded;
      };
    }
    return filters;
  },
});

export const modalLabelFilters = selector({
  key: "modalLabelFilters",
  get: ({ get }) => {
    const frameLabels = get(atoms.modalActiveLabels("frame"));
    const labels = {
      ...get(atoms.modalActiveLabels("sample")),
      ...Object.keys(frameLabels).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
    const hiddenObjects = get(atoms.hiddenObjects);
    const filters = {};
    for (const label in labels) {
      const range = get(atoms.modalFilterLabelConfidenceRange(label));
      const none = get(atoms.modalFilterLabelIncludeNoConfidence(label));
      const include = get(atoms.modalFilterIncludeLabels(label));
      filters[label] = (s) => {
        if (hiddenObjects[s.id]) {
          return false;
        }
        const inRange =
          range[0] - 0.005 <= s.confidence && s.confidence <= range[1] + 0.005;
        const noConfidence = none && s.confidence === undefined;
        const isIncluded = include.length === 0 || include.includes(s.label);
        return labels[label] && (inRange || noConfidence) && isIncluded;
      };
    }
    return filters;
  },
  set: ({ get, set }, _) => {
    const paths = get(labelPaths);
    const activeLabels = get(atoms.activeLabels("sample"));
    set(atoms.modalActiveLabels("sample"), activeLabels);
    const activeFrameLabels = get(atoms.activeLabels("frame"));
    set(atoms.modalActiveLabels("frame"), activeFrameLabels);
    for (const label of paths) {
      set(
        atoms.modalFilterLabelConfidenceRange(label),
        get(filterLabelConfidenceRange(label))
      );

      set(
        atoms.modalFilterLabelIncludeNoConfidence(label),
        get(filterLabelIncludeNoConfidence(label))
      );

      set(
        atoms.modalFilterIncludeLabels(label),
        get(filterIncludeLabels(label))
      );

      set(atoms.modalColorByLabel, get(atoms.colorByLabel));
    }
  },
});

export const labelTuples = selectorFamily({
  key: "labelTuples",
  get: (dimension: string) => ({ get }) => {
    const types = get(labelTypes(dimension));
    return get(labelNames(dimension)).map((n, i) => [n, types[i]]);
  },
});

export const labelMap = selectorFamily({
  key: "labelMap",
  get: (dimension: string) => ({ get }) => {
    const tuples = get(labelTuples(dimension));
    return tuples.reduce((acc, cur) => {
      return {
        [cur[0]]: cur[1],
        ...acc,
      };
    }, {});
  },
});

const scalarsMap = selectorFamily({
  key: "scalarsMap",
  get: (dimension: string) => ({ get }) => {
    const types = get(scalarTypes(dimension));
    return get(scalarNames(dimension)).reduce(
      (acc, cur, i) => ({
        ...acc,
        [cur]: types[i],
      }),
      {}
    );
  },
});

export const appConfig = selector({
  key: "appConfig",
  get: ({ get }) => {
    return get(atoms.stateDescription).config || {};
  },
});

export const colorPool = selector({
  key: "colorPool",
  get: ({ get }) => {
    return get(appConfig).color_pool || [];
  },
});

export const colorMap = selector({
  key: "colorMap",
  get: ({ get }) => {
    let pool = get(colorPool);
    pool = pool.length ? pool : [lightTheme.brand];
    const seed = get(atoms.colorSeed);
    const colorLabelNames = get(labelTuples("sample"))
      .filter(([name, type]) => labelTypeHasColor(type))
      .map(([name]) => name);
    const colorFrameLabelNames = get(labelTuples("frame"))
      .filter(([name, type]) => labelTypeHasColor(type))
      .map(([name]) => "frames." + name);
    const scalarsList = [
      ...get(scalarNames("sample")),
      ...get(scalarNames("frame")),
    ];

    return generateColorMap(
      pool,
      [
        ...get(tagNames),
        ...scalarsList,
        ...colorLabelNames,
        ...colorFrameLabelNames,
      ],
      seed
    );
  },
});

export const isLabel = selectorFamily({
  key: "isLabel",
  get: (field) => ({ get }) => {
    const names = get(labelNames("sample")).concat(
      get(labelNames("frame")).map((l) => "frames." + l)
    );
    return names.includes(field);
  },
});

export const modalFieldIsFiltered = selectorFamily({
  key: "modalFieldIsFiltered",
  get: (field: string) => ({ get }): boolean => {
    const label = get(isLabel(field));

    if (!label) {
      return false;
    }

    const range = get(atoms.modalFilterLabelConfidenceRange(field));
    const bounds = get(labelConfidenceBounds(field));
    const none = get(atoms.modalFilterLabelIncludeNoConfidence(field));
    const include = get(atoms.modalFilterIncludeLabels(field));
    const maxMin = label ? 0 : bounds[0];
    const minMax = label ? 1 : bounds[1];
    const stretchedBounds = [
      maxMin < bounds[0] && bounds[1] !== bounds[0] ? maxMin : bounds[0],
      minMax > bounds[1] && bounds[1] !== bounds[0] ? minMax : bounds[1],
    ];

    const rangeIsFiltered =
      stretchedBounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) && bounds[0] !== bounds[1];

    return Boolean(include.length) || rangeIsFiltered || !none;
  },
});

export const fieldIsFiltered = selectorFamily({
  key: "fieldIsFiltered",
  get: (field: string) => ({ get }): boolean => {
    const label = get(isLabel(field));
    const numeric = get(isNumericField(field));
    const range = get(
      label ? filterLabelConfidenceRange(field) : filterNumericFieldRange(field)
    );
    const bounds = get(
      label ? labelConfidenceBounds(field) : numericFieldBounds(field)
    );
    const none = get(
      label
        ? filterLabelIncludeNoConfidence(field)
        : filterNumericFieldIncludeNone(field)
    );
    const include = get(filterIncludeLabels(field));
    const maxMin = label ? 0 : bounds[0];
    const minMax = label ? 1 : bounds[1];
    const stretchedBounds = [
      maxMin < bounds[0] ? maxMin : bounds[0],
      minMax > bounds[1] ? minMax : bounds[1],
    ];

    if (!label && !numeric) return false;

    const rangeIsFiltered =
      stretchedBounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) && bounds[0] !== bounds[1];

    if (numeric) return rangeIsFiltered || !none;

    return Boolean(include.length) || rangeIsFiltered || !none;
  },
});

export const labelConfidenceBounds = selectorFamily({
  key: "labelConfidenceBounds",
  get: (label) => ({ get }) => {
    return (get(datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (
          cur.name &&
          cur.name.includes(label) &&
          cur._CLS === CONFIDENCE_BOUNDS_CLS
        ) {
          let bounds = cur.result;
          bounds = [
            0 < bounds[0] ? 0 : bounds[0],
            1 > bounds[1] ? 1 : bounds[1],
          ];
          return [
            bounds[0] !== null && bounds[0] !== 0
              ? Number((bounds[0] - 0.01).toFixed(2))
              : bounds[0],
            bounds[1] !== null && bounds[1] !== 1
              ? Number((bounds[1] + 0.01).toFixed(2))
              : bounds[1],
          ];
        }
        return acc;
      },
      [null, null]
    );
  },
});

export const numericFieldBounds = selectorFamily({
  key: "numericFieldBounds",
  get: (label) => ({ get }) => {
    return (get(datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (cur.name === label && cur._CLS === BOUNDS_CLS) {
          const { result: bounds } = cur;
          return [
            bounds[0] !== null && bounds[0] !== 0
              ? Number((bounds[0] - 0.01).toFixed(2))
              : bounds[0],
            bounds[1] !== null && bounds[1] !== 1
              ? Number((bounds[1] + 0.01).toFixed(2))
              : bounds[1],
          ];
        }
        return acc;
      },
      [null, null]
    );
  },
});

export const labelNameGroups = selectorFamily({
  key: "labelNameGroups",
  get: (dimension: string) => ({ get }) =>
    makeLabelNameGroups(
      get(selectedFields(dimension)),
      get(labelNames(dimension)),
      get(labelTypes(dimension))
    ),
});

export const isNumericField = selectorFamily({
  key: "isNumericField",
  get: (name) => ({ get }) => {
    const map = get(scalarsMap("sample"));
    return VALID_NUMERIC_TYPES.includes(map[name]);
  },
});

export const isStringField = selectorFamily({
  key: "isStringField",
  get: (name) => ({ get }) => {
    const map = get(scalarsMap("sample"));
    return map[name] === STRING_FIELD;
  },
});

export const sampleModalFilter = selector({
  key: "sampleModalFilter",
  get: ({ get }) => {
    const filters = get(modalLabelFilters);
    const frameLabels = get(atoms.modalActiveLabels("frame"));
    const activeLabels = {
      ...get(atoms.modalActiveLabels("sample")),
      ...Object.keys(frameLabels).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
    return (sample) => {
      return Object.entries(sample).reduce((acc, [key, value]) => {
        if (key === "tags") {
          acc[key] = value;
        } else if (value && VALID_LIST_TYPES.includes(value._cls)) {
          acc[key] =
            filters[key] && value !== null
              ? {
                  ...value,
                  [value._cls.toLowerCase()]: value[
                    value._cls.toLowerCase()
                  ].filter(filters[key]),
                }
              : value;
        } else if (value !== null && filters[key] && filters[key](value)) {
          acc[key] = value;
        } else if (RESERVED_FIELDS.includes(key)) {
          acc[key] = value;
        } else if (
          ["string", "number", "null"].includes(typeof value) &&
          activeLabels[key]
        ) {
          acc[key] = value;
        }
        return acc;
      }, {});
    };
  },
});

const resolveFilter = ({ num, str }) => {
  const filter = {};
  if (num) {
    const defaultRange = num.range.every((r, i) => r === num.bounds[i]);
    if (
      defaultRange &&
      num.none &&
      (!str || (str.values === null && str.values.length === 0))
    ) {
      return null;
    }
    if (!defaultRange) {
      filter.range = num.range;
      filter.none = num.none;
    }
    if (defaultRange && !num.none) {
      filter.none = num.none;
    }
  }
  if (str) {
    if (str.values !== null && str.values.length > 0) {
      filter.values = {};
      filter.values.include = str.values;
    }
    if (str.values.length > 0 || str.none === false) {
      if (!filter.values) filter.values = {};
      filter.values.none = str.none;
    }
  }
  if (Object.keys(filter).length > 0) return filter;
  return null;
};

export const filterIncludeLabels = selectorFamily({
  key: "filterIncludeLabels",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.values?.include ?? [];
  },
  set: (path) => ({ get, set }, labels) => {
    const bounds = get(labelConfidenceBounds(path));
    const range = get(filterLabelConfidenceRange(path));
    const none = get(filterLabelIncludeNoConfidence(path));
    const noLabel = get(filterIncludeNoLabel(path));
    const filter = resolveFilter({
      num: { bounds, range, none },
      str: { values: labels, none: noLabel, path: "label" },
    });
    set(filterStage(path), filter);
  },
});

export const filterIncludeNoLabel = selectorFamily({
  key: "filterIncludeNoLabel",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    const none = filter?.values?.none;
    return typeof none === "boolean" ? none : true;
  },
  set: (path) => ({ get, set }, noLabel) => {
    const bounds = get(labelConfidenceBounds(path));
    const range = get(filterLabelConfidenceRange(path));
    const none = get(filterLabelIncludeNoConfidence(path));
    const labels = get(filterIncludeLabels(path));
    const filter = resolveFilter({
      num: { bounds, range, none },
      str: { values: labels, none: noLabel, path: "label" },
    });
    set(filterStage(path), filter);
  },
});

export const filterLabelConfidenceRange = selectorFamily({
  key: "filterLabelConfidenceRange",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    if (filter?.range) return filter.range;
    return get(labelConfidenceBounds(path));
  },
  set: (path) => ({ get, set }, range) => {
    const bounds = get(labelConfidenceBounds(path));
    const none = get(filterLabelIncludeNoConfidence(path));
    const labels = get(filterIncludeLabels(path));
    const noLabel = get(filterIncludeNoLabel(path));
    const filter = resolveFilter({
      num: { bounds, range, none },
      str: { values: labels, none: noLabel, path: "label" },
    });
    set(filterStage(path), filter);
  },
});

export const filterLabelIncludeNoConfidence = selectorFamily({
  key: "filterLabelIncludeNoConfidence",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.none ?? true;
  },
  set: (path) => ({ get, set }, none) => {
    const range = get(filterLabelConfidenceRange(path));
    const bounds = get(labelConfidenceBounds(path));
    const labels = get(filterIncludeLabels(path));
    const noLabel = get(filterIncludeNoLabel(path));
    const filter = resolveFilter({
      num: { bounds, range, none },
      str: { values: labels, none: noLabel, path: "label" },
    });
    set(filterStage(path), filter);
  },
});

export const filterNumericFieldRange = selectorFamily({
  key: "filterNumericFieldRange",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.range ?? get(numericFieldBounds(path));
  },
  set: (path) => ({ get, set }, range) => {
    const bounds = get(numericFieldBounds(path));
    const none = get(filterNumericFieldIncludeNone(path));
    const filter = resolveFilter({
      num: { bounds, range, none },
      str: null,
    });
    set(filterStage(path), filter);
  },
});

export const filterNumericFieldIncludeNone = selectorFamily({
  key: "filterNumericFieldIncludeNone",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.none ?? true;
  },
  set: (path) => ({ get, set }, none) => {
    const range = get(filterNumericFieldRange(path));
    const bounds = get(numericFieldBounds(path));
    const filter = resolveFilter({
      num: { bounds, range, none },
      str: null,
    });
    set(filterStage(path), filter);
  },
});

export const filterStringFieldValues = selectorFamily({
  key: "filterStringFieldValues",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.values?.include ?? [];
  },
  set: (path) => ({ get, set }, values) => {
    const none = get(filterStringFieldIncludeNone(path));
    const filter = resolveFilter({
      num: null,
      str: { values, none },
    });
    set(filterStage(path), filter);
  },
});

export const filterStringFieldIncludeNone = selectorFamily({
  key: "filterStringFieldIncludeNone",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.none ?? true;
  },
  set: (path) => ({ get, set }, none) => {
    const values = get(filterStringFieldValues(path));
    const filter = resolveFilter({
      num: null,
      str: { values, none },
    });
    set(filterStage(path), filter);
  },
});

export const stringFieldValues = selectorFamily({
  key: "stringFieldValues",
  get: (fieldName) => ({ get }) => {
    const stats = get(datasetStats);
    return (get(datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === fieldName && cur._CLS === LABELS_CLS) {
        return cur.result;
      }
      return acc;
    }, []);
  },
});
