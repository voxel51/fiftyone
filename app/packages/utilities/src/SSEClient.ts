export interface SSEClientOptions {
  headers: HeadersInit;
  data: unknown;
  withCredentials: boolean;
}

export enum SSEReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

const FIELD_SEPARATOR = ":";

interface Listener {
  (this: EventSource, ev: Event | MessageEvent<any>): any;
}

interface Listeners {
  [key: string]: Listener[];
}

class SSEClient {
  private readonly options: SSEClientOptions;
  private readonly url: string;
  private readyState: SSEReadyState = SSEReadyState.CONNECTING;
  private progress: 0;
  private listeners: Listeners = {};
  private chunk: string = "";
  private xhr: XMLHttpRequest;

  constructor(url: string, options: Partial<SSEClientOptions>) {
    this.options = {
      headers: {},
      data: {},
      withCredentials: false,
      ...options,
    };
    this.url = url;
  }

  addEventListener(type: string, listener: Listener) {
    if (this.listeners[type] === undefined) {
      this.listeners[type] = [];
    }

    if (this.listeners[type].indexOf(listener) === -1) {
      this.listeners[type].push(listener);
    }
  }

  removeEventListener(type: string, listener: Listener) {
    if (this.listeners[type] === undefined) {
      return;
    }

    var filtered = [];
    this.listeners[type].forEach(function (element) {
      if (element !== listener) {
        filtered.push(element);
      }
    });
    if (filtered.length === 0) {
      delete this.listeners[type];
    } else {
      this.listeners[type] = filtered;
    }
  }

  dispatchEvent(e: CustomEvent) {
    if (!e) {
      return true;
    }

    var onHandler = "on" + e.type;
    if (this.hasOwnProperty(onHandler)) {
      this[onHandler].call(this, e);
      if (e.defaultPrevented) {
        return false;
      }
    }

    if (this.listeners[e.type]) {
      return this.listeners[e.type].every((callback) => {
        callback.call(this, e);
        return !e.defaultPrevented;
      });
    }

    return true;
  }

  stream() {
    this.setReadyState(SSEReadyState.CONNECTING);

    this.xhr = new XMLHttpRequest();
    this.xhr.addEventListener("progress", this.onStreamProgress.bind(this));
    this.xhr.addEventListener("load", this.onStreamLoaded.bind(this));
    this.xhr.addEventListener(
      "readystatechange",
      this.checkStreamClosed.bind(this)
    );
    this.xhr.addEventListener("error", this.onStreamFailure.bind(this));
    this.xhr.addEventListener("abort", this.onStreamFailure.bind(this));
    this.xhr.open("POST", this.url);
    for (var header in this.options.headers) {
      this.xhr.setRequestHeader(header, this.options.headers[header]);
    }
    this.xhr.withCredentials = this.options.withCredentials;
    this.xhr.send(JSON.stringify(this.options.data));
  }

  close() {
    if (this.readyState === SSEReadyState.CLOSED) {
      return;
    }

    this.xhr.abort();
    this.xhr = null;
    this.setReadyState(SSEReadyState.CLOSED);
  }

  private checkStreamClosed() {
    if (!this.xhr) {
      return;
    }

    if (this.xhr.readyState === XMLHttpRequest.DONE) {
      this.setReadyState(SSEReadyState.CLOSED);
    }
  }

  private onStreamFailure(e) {
    this.dispatchEvent(new CustomEvent("error"));
    this.close();
  }

  private onStreamLoaded(e) {
    this.onStreamProgress(e);

    this.dispatchEvent(this.parseEventChunk(this.chunk));
    this.chunk = "";
  }

  private onStreamProgress(e: Event) {
    if (!this.xhr) {
      return;
    }

    if (this.xhr.status !== 200) {
      this.onStreamFailure(e);
      return;
    }

    if (this.readyState == SSEReadyState.CONNECTING) {
      this.dispatchEvent(new CustomEvent("open"));
      this.setReadyState(SSEReadyState.OPEN);
    }

    var data = this.xhr.responseText.substring(this.progress);
    this.progress += data.length;
    data.split(/(\r\n|\r|\n){2}/g).forEach(
      function (part) {
        if (part.trim().length === 0) {
          this.dispatchEvent(this._parseEventChunk(this.chunk.trim()));
          this.chunk = "";
        } else {
          this.chunk += part;
        }
      }.bind(this)
    );
  }

  private parseEventChunk(chunk: string) {
    if (!chunk || chunk.length === 0) {
      return null;
    }

    var e = { id: null, retry: null, data: "", event: "message" };
    chunk.split(/\n|\r\n|\r/).forEach(
      function (line) {
        line = line.trimRight();
        var index = line.indexOf(FIELD_SEPARATOR);
        if (index <= 0) {
          return;
        }

        var field = line.substring(0, index);
        if (!(field in e)) {
          return;
        }

        var value = line.substring(index + 1).trimLeft();
        if (field === "data") {
          e[field] += value;
        } else {
          e[field] = value;
        }
      }.bind(this)
    );

    var event = new CustomEvent(e.event, {
      detail: { data: e.data, id: e.id },
    });

    return event;
  }

  private setReadyState(state: SSEReadyState) {
    var event = new CustomEvent("readystatechange", { detail: { state } });
    this.readyState = state;
    this.dispatchEvent(event);
  }
}

export default SSEClient;
