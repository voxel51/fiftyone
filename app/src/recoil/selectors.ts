import { selector, selectorFamily } from "recoil";
import ReconnectingWebSocket from "reconnecting-websocket";
import uuid from "uuid-v4";

import * as atoms from "./atoms";
import { generateColorMap } from "../utils/colors";
import { isElectron } from "../utils/generic";
import {
  RESERVED_FIELDS,
  VALID_LABEL_TYPES,
  VALID_SCALAR_TYPES,
  makeLabelNameGroups,
  labelTypeHasColor,
  AGGS,
  VALID_LIST_TYPES,
  HIDDEN_LABEL_ATTRS,
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

export const refresh = selector<boolean>({
  key: "refresh",
  get: ({ get }) => get(atoms.stateDescription).refresh,
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

export const filterStage = selectorFamily<any, string>({
  key: "filterStage",
  get: (path) => ({ get }) => {
    return get(filterStages)?.[path] ?? {};
  },
  set: (path: string) => ({ get, set }, filter) => {
    const filters = Object.assign({}, get(filterStages));
    if (filter === null) {
      delete filters[path];
    } else {
      filters[path] = filter;
    }
    set(filterStages, filters);
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
      return raw.stats.main;
    }
    return null;
  },
});

export const noneFieldCounts = selector<{ [key: string]: number }>({
  key: "noneFieldCounts",
  get: ({ get }) => {
    const raw = get(atoms.datasetStatsRaw);
    const currentView = get(view);
    if (!raw.view) {
      return {};
    }
    if (viewsAreEqual(raw.view, currentView)) {
      return raw.stats.none.reduce((acc, cur) => {
        acc[cur.name] = cur.result;
        return acc;
      }, {});
    }
    return {};
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

    return raw.stats.main;
  },
});

export const totalCount = selector<number>({
  key: "totalCount",
  get: ({ get }) => {
    const stats = get(datasetStats) || [];
    return stats.reduce(
      (acc, cur) => (cur.name === null ? cur.result : acc),
      null
    );
  },
});

export const filteredCount = selector<number>({
  key: "filteredCount",
  get: ({ get }) => {
    const stats = get(extendedDatasetStats) || [];
    return stats.reduce(
      (acc, cur) => (cur.name === null ? cur.result : acc),
      null
    );
  },
});

export const tagNames = selector<string[]>({
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
  return (
    VALID_SCALAR_TYPES.includes(f.ftype) &&
    !f.name.startsWith("_") &&
    f.name !== "filepath"
  );
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
    const showTooltip = get(appConfig).show_tooltip;
    return {
      showAttrs,
      showConfidence,
      showTooltip,
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

const labels = selectorFamily<
  { name: string; embedded_doc_type: string }[],
  string
>({
  key: "labels",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(selectedFields(dimension));
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(labelFilter)
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  },
});

export const labelNames = selectorFamily<string[], string>({
  key: "labelNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(labels(dimension));
    return l.map((l) => l.name);
  },
});

export const labelPaths = selector<string[]>({
  key: "labelPaths",
  get: ({ get }) => {
    const sampleLabels = get(labelNames("sample"));
    const frameLabels = get(labelNames("frame"));
    return sampleLabels.concat(frameLabels.map((l) => "frames." + l));
  },
});

export const labelTypesMap = selector<{ [key: string]: string }>({
  key: "labelTypesMap",
  get: ({ get }) => {
    const sampleLabels = get(labelNames("sample"));
    const sampleLabelTypes = get(labelTypes("sample"));
    const frameLabels = get(labelNames("frame"));
    const frameLabelTypes = get(labelTypes("frame"));
    const sampleTuples = sampleLabels.map((l, i) => [l, sampleLabelTypes[i]]);
    const frameTuples = frameLabels.map((l, i) => [
      `frames.${l}`,
      frameLabelTypes[i],
    ]);
    return Object.fromEntries(sampleTuples.concat(frameTuples));
  },
});

export const labelTypes = selectorFamily<string[], string>({
  key: "labelTypes",
  get: (dimension) => ({ get }) => {
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

export const scalarsMap = selectorFamily<{ [key: string]: string }, string>({
  key: "scalarsMap",
  get: (dimension) => ({ get }) => {
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

export const colorMap = selectorFamily<{ [key: string]: string }, boolean>({
  key: "colorMap",
  get: (modal) => ({ get }) => {
    const colorByLabel = get(atoms.colorByLabel(modal));
    let pool = get(colorPool);
    pool = pool.length ? pool : [lightTheme.brand];
    const seed = get(atoms.colorSeed(modal));
    if (colorByLabel) {
      let values = ["true", "false"];
      const stats = get(datasetStats);
      Object.values(stats).forEach(({ result, _CLS }) => {
        if (_CLS === AGGS.DISTINCT) {
          values = [...values, ...result];
        }
      });
      values = [...get(tagNames), ...values];
      return generateColorMap(pool, Array.from(new Set(values)), seed, false);
    } else {
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
    }
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

export const defaultTargets = selector({
  key: "defaultTargets",
  get: ({ get }) => {
    const targets =
      get(atoms.stateDescription).dataset?.default_mask_targets || {};
    return Object.fromEntries(
      Object.entries(targets).map(([k, v]) => [parseInt(k, 10), v])
    );
  },
});

export const targets = selector({
  key: "targets",
  get: ({ get }) => {
    const defaults =
      get(atoms.stateDescription).dataset?.default_mask_targets || {};
    const labelTargets =
      get(atoms.stateDescription).dataset?.mask_targets || {};
    return {
      defaults,
      fields: labelTargets,
    };
  },
});

export const getTarget = selector({
  key: "getTarget",
  get: ({ get }) => {
    const { defaults, fields } = get(targets);
    return (field, target) => {
      if (field in fields) {
        return fields[field][target];
      }
      return defaults[target];
    };
  },
});

export const modalSample = selector({
  key: "modalSample",
  get: ({ get }) => {
    return get(atoms.modal).sample;
  },
});

export const tagSampleModalCounts = selector<{ [key: string]: number }>({
  key: "tagSampleModalCounts",
  get: ({ get }) => {
    const sample = get(modalSample);
    const tags = get(tagNames);
    return tags.reduce((acc, cur) => {
      acc[cur] = sample.tags.includes(cur) ? 1 : 0;
      return acc;
    }, {});
  },
});

export const selectedObjectIds = selector<Set<string>>({
  key: "selectedObjectIds",
  get: ({ get }) => {
    const objs = get(atoms.selectedObjects);
    return new Set(Object.keys(objs));
  },
});

export const selectedSampleIndices = selector<{ [key: string]: number }>({
  key: "selectedSampleIndices",
  get: ({ get }) => {
    const samples = get(atoms.currentSamples);
    return Object.fromEntries(
      samples.map(({ sample }, index) => [sample._id, index])
    );
  },
});

export const modalLabelAttrs = selectorFamily<
  [string, string | null | number],
  { field: string; id: string }
>({
  key: "modalLabelAttrs",
  get: ({ field, id }) => ({ get }) => {
    const sample = get(modalSample);
    const type = get(labelTypesMap)[field];
    let label = sample[field];
    if (VALID_LIST_TYPES.includes(type)) {
      label = label[type.toLocaleLowerCase()].filter((l) => l._id === id)[0];
    }

    const hidden = HIDDEN_LABEL_ATTRS[label._cls.toLowerCase()];
    return Object.entries(label)
      .filter((a) => !hidden.includes(a[0]) && !a[0].startsWith("_"))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  },
});
