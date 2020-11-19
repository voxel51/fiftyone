/*! For license information please see main.prod.js.LICENSE.txt */
module.exports = (function (e) {
  var t = {};
  function n(r) {
    if (t[r]) return t[r].exports;
    var i = (t[r] = { i: r, l: !1, exports: {} });
    return e[r].call(i.exports, i, i.exports, n), (i.l = !0), i.exports;
  }
  return (
    (n.m = e),
    (n.c = t),
    (n.d = function (e, t, r) {
      n.o(e, t) || Object.defineProperty(e, t, { enumerable: !0, get: r });
    }),
    (n.r = function (e) {
      "undefined" != typeof Symbol &&
        Symbol.toStringTag &&
        Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }),
        Object.defineProperty(e, "__esModule", { value: !0 });
    }),
    (n.t = function (e, t) {
      if ((1 & t && (e = n(e)), 8 & t)) return e;
      if (4 & t && "object" == typeof e && e && e.__esModule) return e;
      var r = Object.create(null);
      if (
        (n.r(r),
        Object.defineProperty(r, "default", { enumerable: !0, value: e }),
        2 & t && "string" != typeof e)
      )
        for (var i in e)
          n.d(
            r,
            i,
            function (t) {
              return e[t];
            }.bind(null, i)
          );
      return r;
    }),
    (n.n = function (e) {
      var t =
        e && e.__esModule
          ? function () {
              return e.default;
            }
          : function () {
              return e;
            };
      return n.d(t, "a", t), t;
    }),
    (n.o = function (e, t) {
      return Object.prototype.hasOwnProperty.call(e, t);
    }),
    (n.p = ""),
    n((n.s = "./app/main.dev.ts"))
  );
})({
  "./app/main.dev.ts": function (e, t, n) {
    "use strict";
    n.r(t),
      n.d(t, "default", function () {
        return l;
      });
    var r = n("path"),
      i = n.n(r),
      s = n("electron"),
      o = n("./node_modules/electron-updater/out/main.js"),
      a = n("./node_modules/electron-log/src/index.js"),
      u = n.n(a);
    class c {
      constructor(e) {
        (this.mainWindow = void 0), (this.mainWindow = e);
      }
      buildMenu() {
        const e =
            "darwin" === process.platform
              ? this.buildDarwinTemplate()
              : this.buildDefaultTemplate(),
          t = s.Menu.buildFromTemplate(e);
        return s.Menu.setApplicationMenu(t), t;
      }
      setupDevelopmentEnvironment() {
        this.mainWindow.webContents.on("context-menu", (e, t) => {
          const { x: n, y: r } = t;
          s.Menu.buildFromTemplate([
            {
              label: "Inspect element",
              click: () => {
                this.mainWindow.webContents.inspectElement(n, r);
              },
            },
          ]).popup({ window: this.mainWindow });
        });
      }
      buildDarwinTemplate() {
        return [
          {
            label: "FiftyOne",
            submenu: [
              {
                label: "About FiftyOne",
                selector: "orderFrontStandardAboutPanel:",
              },
              { type: "separator" },
              { label: "Services", submenu: [] },
              { type: "separator" },
              {
                label: "Hide FiftyOne",
                accelerator: "Command+H",
                selector: "hide:",
              },
              {
                label: "Hide Others",
                accelerator: "Command+Shift+H",
                selector: "hideOtherApplications:",
              },
              { label: "Show All", selector: "unhideAllApplications:" },
              { type: "separator" },
              {
                label: "Quit",
                accelerator: "Command+Q",
                click: () => {
                  s.app.quit();
                },
              },
            ],
          },
          {
            label: "Edit",
            submenu: [
              { label: "Undo", accelerator: "Command+Z", selector: "undo:" },
              {
                label: "Redo",
                accelerator: "Shift+Command+Z",
                selector: "redo:",
              },
              { type: "separator" },
              { label: "Cut", accelerator: "Command+X", selector: "cut:" },
              { label: "Copy", accelerator: "Command+C", selector: "copy:" },
              { label: "Paste", accelerator: "Command+V", selector: "paste:" },
              {
                label: "Select All",
                accelerator: "Command+A",
                selector: "selectAll:",
              },
            ],
          },
          {
            label: "View",
            submenu: [
              {
                label: "Toggle Full Screen",
                accelerator: "Ctrl+Command+F",
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                },
              },
            ],
          },
          {
            label: "Window",
            submenu: [
              {
                label: "Minimize",
                accelerator: "Command+M",
                selector: "performMiniaturize:",
              },
              {
                label: "Close",
                accelerator: "Command+W",
                selector: "performClose:",
              },
              { type: "separator" },
              { label: "Bring All to Front", selector: "arrangeInFront:" },
            ],
          },
          {
            label: "Settings",
            submenu: [
              {
                label: "Port number",
                accelerator: "Ctrl+Shift+R",
                click: () => {
                  this.mainWindow.webContents.send(
                    "update-session-config",
                    "..."
                  );
                },
              },
            ],
          },
          {
            label: "Help",
            submenu: [
              {
                label: "Email",
                click() {
                  s.shell.openExternal("mailto:support@voxel51.com");
                },
              },
              {
                label: "Documentation",
                click() {
                  s.shell.openExternal("https://voxel51.com/docs/fiftyone");
                },
              },
              {
                label: "Slack",
                click() {
                  s.shell.openExternal(
                    "https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg"
                  );
                },
              },
            ],
          },
        ];
      }
      buildDefaultTemplate() {
        return [
          {
            label: "&File",
            submenu: [
              {
                label: "&Close",
                accelerator: "Ctrl+W",
                click: () => {
                  this.mainWindow.close();
                },
              },
            ],
          },
          {
            label: "&View",
            submenu: [
              {
                label: "Toggle &Full Screen",
                accelerator: "F11",
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                },
              },
            ],
          },
          {
            label: "Settings",
            submenu: [
              {
                label: "Port number",
                accelerator: "Ctrl+Shift+R",
                click: () => {
                  this.mainWindow.webContents.send(
                    "update-session-config",
                    "..."
                  );
                },
              },
            ],
          },
          {
            label: "Help",
            submenu: [
              {
                label: "Email",
                click() {
                  s.shell.openExternal("mailto:support@voxel51.com");
                },
              },
              {
                label: "Documentation",
                click() {
                  s.shell.openExternal("https://voxel51.com/docs/fiftyone");
                },
              },
              {
                label: "Slack",
                click() {
                  s.shell.openExternal(
                    "https://join.slack.com/t/fiftyone-users/shared_invite/zt-gtpmm76o-9AjvzNPBOzevBySKzt02gg"
                  );
                },
              },
            ],
          },
        ];
      }
    }
    class l {
      constructor() {
        (u.a.transports.file.level = "info"),
          (o.autoUpdater.logger = u.a),
          o.autoUpdater.checkForUpdatesAndNotify();
      }
    }
    let h = null;
    n("./node_modules/source-map-support/source-map-support.js").install();
    const d = async () => {
      let e = {
        show: !1,
        width: 1024,
        height: 728,
        webPreferences: { nodeIntegration: !0 },
      };
      process.env.APPDIR &&
        (e.icon = i.a.join(
          process.env.APPDIR,
          "usr/share/icons/hicolor/256x256/apps/fiftyone.png"
        )),
        (h = new s.BrowserWindow(e)),
        h.loadURL(`file://${__dirname}/app.html`),
        h.webContents.on("did-finish-load", () => {
          if (!h) throw new Error('"mainWindow" is not defined');
          h.show(), h.focus();
        }),
        h.on("closed", () => {
          h = null;
        });
      new c(h).buildMenu(), new l();
    };
    s.app.on("window-all-closed", () => {
      s.app.quit();
    }),
      s.app.on("ready", d),
      s.app.on("activate", () => {
        null === h && d();
      });
  },
  "./node_modules/7zip/index.js": function (e, t, n) {
    var r,
      i,
      s = n("path").resolve,
      o = n("./node_modules/7zip/package.json").bin;
    e.exports =
      ((r = o),
      (i = function (e) {
        return s(__dirname, e);
      }),
      Object.keys(r).reduce(function (e, t) {
        return (e[t] = i(r[t])), e;
      }, {}));
  },
  "./node_modules/7zip/package.json": function (e) {
    e.exports = JSON.parse(
      '{"name":"7zip","version":"0.0.6","description":"7zip Windows Package via Node.js","keywords":["7z","7zip","7-zip","windows","install"],"repository":"git@github.com:fritx/win-7zip.git","bin":{"7z":"7zip-lite/7z.exe"},"main":"index.js","scripts":{"test":"mocha"},"license":"GNU LGPL"}'
    );
  },
  "./node_modules/at-least-node/index.js": function (e, t) {
    e.exports = (e) => {
      const t = process.versions.node.split(".").map((e) => parseInt(e, 10));
      return (
        (e = e.split(".").map((e) => parseInt(e, 10))),
        t[0] > e[0] ||
          (t[0] === e[0] && (t[1] > e[1] || (t[1] === e[1] && t[2] >= e[2])))
      );
    };
  },
  "./node_modules/balanced-match/index.js": function (e, t, n) {
    "use strict";
    function r(e, t, n) {
      e instanceof RegExp && (e = i(e, n)),
        t instanceof RegExp && (t = i(t, n));
      var r = s(e, t, n);
      return (
        r && {
          start: r[0],
          end: r[1],
          pre: n.slice(0, r[0]),
          body: n.slice(r[0] + e.length, r[1]),
          post: n.slice(r[1] + t.length),
        }
      );
    }
    function i(e, t) {
      var n = t.match(e);
      return n ? n[0] : null;
    }
    function s(e, t, n) {
      var r,
        i,
        s,
        o,
        a,
        u = n.indexOf(e),
        c = n.indexOf(t, u + 1),
        l = u;
      if (u >= 0 && c > 0) {
        for (r = [], s = n.length; l >= 0 && !a; )
          l == u
            ? (r.push(l), (u = n.indexOf(e, l + 1)))
            : 1 == r.length
            ? (a = [r.pop(), c])
            : ((i = r.pop()) < s && ((s = i), (o = c)),
              (c = n.indexOf(t, l + 1))),
            (l = u < c && u >= 0 ? u : c);
        r.length && (a = [s, o]);
      }
      return a;
    }
    (e.exports = r), (r.range = s);
  },
  "./node_modules/brace-expansion/index.js": function (e, t, n) {
    var r = n("./node_modules/concat-map/index.js"),
      i = n("./node_modules/balanced-match/index.js");
    e.exports = function (e) {
      if (!e) return [];
      "{}" === e.substr(0, 2) && (e = "\\{\\}" + e.substr(2));
      return (function e(t, n) {
        var s = [],
          o = i("{", "}", t);
        if (!o || /\$$/.test(o.pre)) return [t];
        var u,
          c = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(o.body),
          h = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(o.body),
          g = c || h,
          y = o.body.indexOf(",") >= 0;
        if (!g && !y)
          return o.post.match(/,.*\}/)
            ? ((t = o.pre + "{" + o.body + a + o.post), e(t))
            : [t];
        if (g) u = o.body.split(/\.\./);
        else {
          if (
            1 ===
            (u = (function e(t) {
              if (!t) return [""];
              var n = [],
                r = i("{", "}", t);
              if (!r) return t.split(",");
              var s = r.pre,
                o = r.body,
                a = r.post,
                u = s.split(",");
              u[u.length - 1] += "{" + o + "}";
              var c = e(a);
              a.length && ((u[u.length - 1] += c.shift()), u.push.apply(u, c));
              return n.push.apply(n, u), n;
            })(o.body)).length
          )
            if (1 === (u = e(u[0], !1).map(d)).length)
              return (x = o.post.length ? e(o.post, !1) : [""]).map(function (
                e
              ) {
                return o.pre + u[0] + e;
              });
        }
        var v,
          E = o.pre,
          x = o.post.length ? e(o.post, !1) : [""];
        if (g) {
          var b = l(u[0]),
            D = l(u[1]),
            w = Math.max(u[0].length, u[1].length),
            _ = 3 == u.length ? Math.abs(l(u[2])) : 1,
            C = f;
          D < b && ((_ *= -1), (C = m));
          var S = u.some(p);
          v = [];
          for (var A = b; C(A, D); A += _) {
            var j;
            if (h) "\\" === (j = String.fromCharCode(A)) && (j = "");
            else if (((j = String(A)), S)) {
              var F = w - j.length;
              if (F > 0) {
                var k = new Array(F + 1).join("0");
                j = A < 0 ? "-" + k + j.slice(1) : k + j;
              }
            }
            v.push(j);
          }
        } else
          v = r(u, function (t) {
            return e(t, !1);
          });
        for (var T = 0; T < v.length; T++)
          for (var O = 0; O < x.length; O++) {
            var N = E + v[T] + x[O];
            (!n || g || N) && s.push(N);
          }
        return s;
      })(
        (function (e) {
          return e
            .split("\\\\")
            .join(s)
            .split("\\{")
            .join(o)
            .split("\\}")
            .join(a)
            .split("\\,")
            .join(u)
            .split("\\.")
            .join(c);
        })(e),
        !0
      ).map(h);
    };
    var s = "\0SLASH" + Math.random() + "\0",
      o = "\0OPEN" + Math.random() + "\0",
      a = "\0CLOSE" + Math.random() + "\0",
      u = "\0COMMA" + Math.random() + "\0",
      c = "\0PERIOD" + Math.random() + "\0";
    function l(e) {
      return parseInt(e, 10) == e ? parseInt(e, 10) : e.charCodeAt(0);
    }
    function h(e) {
      return e
        .split(s)
        .join("\\")
        .split(o)
        .join("{")
        .split(a)
        .join("}")
        .split(u)
        .join(",")
        .split(c)
        .join(".");
    }
    function d(e) {
      return "{" + e + "}";
    }
    function p(e) {
      return /^-?0\d/.test(e);
    }
    function f(e, t) {
      return e <= t;
    }
    function m(e, t) {
      return e >= t;
    }
  },
  "./node_modules/buffer-from/index.js": function (e, t) {
    var n = Object.prototype.toString,
      r =
        "function" == typeof Buffer.alloc &&
        "function" == typeof Buffer.allocUnsafe &&
        "function" == typeof Buffer.from;
    e.exports = function (e, t, i) {
      if ("number" == typeof e)
        throw new TypeError('"value" argument must not be a number');
      return (
        (s = e),
        "ArrayBuffer" === n.call(s).slice(8, -1)
          ? (function (e, t, n) {
              t >>>= 0;
              var i = e.byteLength - t;
              if (i < 0) throw new RangeError("'offset' is out of bounds");
              if (void 0 === n) n = i;
              else if ((n >>>= 0) > i)
                throw new RangeError("'length' is out of bounds");
              return r
                ? Buffer.from(e.slice(t, t + n))
                : new Buffer(new Uint8Array(e.slice(t, t + n)));
            })(e, t, i)
          : "string" == typeof e
          ? (function (e, t) {
              if (
                (("string" == typeof t && "" !== t) || (t = "utf8"),
                !Buffer.isEncoding(t))
              )
                throw new TypeError(
                  '"encoding" must be a valid string encoding'
                );
              return r ? Buffer.from(e, t) : new Buffer(e, t);
            })(e, t)
          : r
          ? Buffer.from(e)
          : new Buffer(e)
      );
      var s;
    };
  },
  "./node_modules/builder-util-runtime/node_modules/debug/src/browser.js": function (
    e,
    t,
    n
  ) {
    (t.log = function (...e) {
      return "object" == typeof console && console.log && console.log(...e);
    }),
      (t.formatArgs = function (t) {
        if (
          ((t[0] =
            (this.useColors ? "%c" : "") +
            this.namespace +
            (this.useColors ? " %c" : " ") +
            t[0] +
            (this.useColors ? "%c " : " ") +
            "+" +
            e.exports.humanize(this.diff)),
          !this.useColors)
        )
          return;
        const n = "color: " + this.color;
        t.splice(1, 0, n, "color: inherit");
        let r = 0,
          i = 0;
        t[0].replace(/%[a-zA-Z%]/g, (e) => {
          "%%" !== e && (r++, "%c" === e && (i = r));
        }),
          t.splice(i, 0, n);
      }),
      (t.save = function (e) {
        try {
          e ? t.storage.setItem("debug", e) : t.storage.removeItem("debug");
        } catch (e) {}
      }),
      (t.load = function () {
        let e;
        try {
          e = t.storage.getItem("debug");
        } catch (e) {}
        !e &&
          "undefined" != typeof process &&
          "env" in process &&
          (e = process.env.DEBUG);
        return e;
      }),
      (t.useColors = function () {
        if (
          "undefined" != typeof window &&
          window.process &&
          ("renderer" === window.process.type || window.process.__nwjs)
        )
          return !0;
        if (
          "undefined" != typeof navigator &&
          navigator.userAgent &&
          navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)
        )
          return !1;
        return (
          ("undefined" != typeof document &&
            document.documentElement &&
            document.documentElement.style &&
            document.documentElement.style.WebkitAppearance) ||
          ("undefined" != typeof window &&
            window.console &&
            (window.console.firebug ||
              (window.console.exception && window.console.table))) ||
          ("undefined" != typeof navigator &&
            navigator.userAgent &&
            navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) &&
            parseInt(RegExp.$1, 10) >= 31) ||
          ("undefined" != typeof navigator &&
            navigator.userAgent &&
            navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/))
        );
      }),
      (t.storage = (function () {
        try {
          return localStorage;
        } catch (e) {}
      })()),
      (t.colors = [
        "#0000CC",
        "#0000FF",
        "#0033CC",
        "#0033FF",
        "#0066CC",
        "#0066FF",
        "#0099CC",
        "#0099FF",
        "#00CC00",
        "#00CC33",
        "#00CC66",
        "#00CC99",
        "#00CCCC",
        "#00CCFF",
        "#3300CC",
        "#3300FF",
        "#3333CC",
        "#3333FF",
        "#3366CC",
        "#3366FF",
        "#3399CC",
        "#3399FF",
        "#33CC00",
        "#33CC33",
        "#33CC66",
        "#33CC99",
        "#33CCCC",
        "#33CCFF",
        "#6600CC",
        "#6600FF",
        "#6633CC",
        "#6633FF",
        "#66CC00",
        "#66CC33",
        "#9900CC",
        "#9900FF",
        "#9933CC",
        "#9933FF",
        "#99CC00",
        "#99CC33",
        "#CC0000",
        "#CC0033",
        "#CC0066",
        "#CC0099",
        "#CC00CC",
        "#CC00FF",
        "#CC3300",
        "#CC3333",
        "#CC3366",
        "#CC3399",
        "#CC33CC",
        "#CC33FF",
        "#CC6600",
        "#CC6633",
        "#CC9900",
        "#CC9933",
        "#CCCC00",
        "#CCCC33",
        "#FF0000",
        "#FF0033",
        "#FF0066",
        "#FF0099",
        "#FF00CC",
        "#FF00FF",
        "#FF3300",
        "#FF3333",
        "#FF3366",
        "#FF3399",
        "#FF33CC",
        "#FF33FF",
        "#FF6600",
        "#FF6633",
        "#FF9900",
        "#FF9933",
        "#FFCC00",
        "#FFCC33",
      ]),
      (e.exports = n(
        "./node_modules/builder-util-runtime/node_modules/debug/src/common.js"
      )(t));
    const { formatters: r } = e.exports;
    r.j = function (e) {
      try {
        return JSON.stringify(e);
      } catch (e) {
        return "[UnexpectedJSONParseError]: " + e.message;
      }
    };
  },
  "./node_modules/builder-util-runtime/node_modules/debug/src/common.js": function (
    e,
    t,
    n
  ) {
    e.exports = function (e) {
      function t(e) {
        let t = 0;
        for (let n = 0; n < e.length; n++)
          (t = (t << 5) - t + e.charCodeAt(n)), (t |= 0);
        return r.colors[Math.abs(t) % r.colors.length];
      }
      function r(e) {
        let n;
        function o(...e) {
          if (!o.enabled) return;
          const t = o,
            i = Number(new Date()),
            s = i - (n || i);
          (t.diff = s),
            (t.prev = n),
            (t.curr = i),
            (n = i),
            (e[0] = r.coerce(e[0])),
            "string" != typeof e[0] && e.unshift("%O");
          let a = 0;
          (e[0] = e[0].replace(/%([a-zA-Z%])/g, (n, i) => {
            if ("%%" === n) return n;
            a++;
            const s = r.formatters[i];
            if ("function" == typeof s) {
              const r = e[a];
              (n = s.call(t, r)), e.splice(a, 1), a--;
            }
            return n;
          })),
            r.formatArgs.call(t, e);
          (t.log || r.log).apply(t, e);
        }
        return (
          (o.namespace = e),
          (o.enabled = r.enabled(e)),
          (o.useColors = r.useColors()),
          (o.color = t(e)),
          (o.destroy = i),
          (o.extend = s),
          "function" == typeof r.init && r.init(o),
          r.instances.push(o),
          o
        );
      }
      function i() {
        const e = r.instances.indexOf(this);
        return -1 !== e && (r.instances.splice(e, 1), !0);
      }
      function s(e, t) {
        const n = r(this.namespace + (void 0 === t ? ":" : t) + e);
        return (n.log = this.log), n;
      }
      function o(e) {
        return e
          .toString()
          .substring(2, e.toString().length - 2)
          .replace(/\.\*\?$/, "*");
      }
      return (
        (r.debug = r),
        (r.default = r),
        (r.coerce = function (e) {
          if (e instanceof Error) return e.stack || e.message;
          return e;
        }),
        (r.disable = function () {
          const e = [
            ...r.names.map(o),
            ...r.skips.map(o).map((e) => "-" + e),
          ].join(",");
          return r.enable(""), e;
        }),
        (r.enable = function (e) {
          let t;
          r.save(e), (r.names = []), (r.skips = []);
          const n = ("string" == typeof e ? e : "").split(/[\s,]+/),
            i = n.length;
          for (t = 0; t < i; t++)
            n[t] &&
              ("-" === (e = n[t].replace(/\*/g, ".*?"))[0]
                ? r.skips.push(new RegExp("^" + e.substr(1) + "$"))
                : r.names.push(new RegExp("^" + e + "$")));
          for (t = 0; t < r.instances.length; t++) {
            const e = r.instances[t];
            e.enabled = r.enabled(e.namespace);
          }
        }),
        (r.enabled = function (e) {
          if ("*" === e[e.length - 1]) return !0;
          let t, n;
          for (t = 0, n = r.skips.length; t < n; t++)
            if (r.skips[t].test(e)) return !1;
          for (t = 0, n = r.names.length; t < n; t++)
            if (r.names[t].test(e)) return !0;
          return !1;
        }),
        (r.humanize = n(
          "./node_modules/builder-util-runtime/node_modules/ms/index.js"
        )),
        Object.keys(e).forEach((t) => {
          r[t] = e[t];
        }),
        (r.instances = []),
        (r.names = []),
        (r.skips = []),
        (r.formatters = {}),
        (r.selectColor = t),
        r.enable(r.load()),
        r
      );
    };
  },
  "./node_modules/builder-util-runtime/node_modules/debug/src/index.js": function (
    e,
    t,
    n
  ) {
    "undefined" == typeof process ||
    "renderer" === process.type ||
    !0 === process.browser ||
    process.__nwjs
      ? (e.exports = n(
          "./node_modules/builder-util-runtime/node_modules/debug/src/browser.js"
        ))
      : (e.exports = n(
          "./node_modules/builder-util-runtime/node_modules/debug/src/node.js"
        ));
  },
  "./node_modules/builder-util-runtime/node_modules/debug/src/node.js": function (
    e,
    t,
    n
  ) {
    const r = n("tty"),
      i = n("util");
    (t.init = function (e) {
      e.inspectOpts = {};
      const n = Object.keys(t.inspectOpts);
      for (let r = 0; r < n.length; r++)
        e.inspectOpts[n[r]] = t.inspectOpts[n[r]];
    }),
      (t.log = function (...e) {
        return process.stderr.write(i.format(...e) + "\n");
      }),
      (t.formatArgs = function (n) {
        const { namespace: r, useColors: i } = this;
        if (i) {
          const t = this.color,
            i = "[3" + (t < 8 ? t : "8;5;" + t),
            s = `  ${i};1m${r} [0m`;
          (n[0] = s + n[0].split("\n").join("\n" + s)),
            n.push(i + "m+" + e.exports.humanize(this.diff) + "[0m");
        } else
          n[0] =
            (function () {
              if (t.inspectOpts.hideDate) return "";
              return new Date().toISOString() + " ";
            })() +
            r +
            " " +
            n[0];
      }),
      (t.save = function (e) {
        e ? (process.env.DEBUG = e) : delete process.env.DEBUG;
      }),
      (t.load = function () {
        return process.env.DEBUG;
      }),
      (t.useColors = function () {
        return "colors" in t.inspectOpts
          ? Boolean(t.inspectOpts.colors)
          : r.isatty(process.stderr.fd);
      }),
      (t.colors = [6, 2, 3, 4, 5, 1]);
    try {
      const e = n("./node_modules/supports-color/index.js");
      e &&
        (e.stderr || e).level >= 2 &&
        (t.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221,
        ]);
    } catch (e) {}
    (t.inspectOpts = Object.keys(process.env)
      .filter((e) => /^debug_/i.test(e))
      .reduce((e, t) => {
        const n = t
          .substring(6)
          .toLowerCase()
          .replace(/_([a-z])/g, (e, t) => t.toUpperCase());
        let r = process.env[t];
        return (
          (r =
            !!/^(yes|on|true|enabled)$/i.test(r) ||
            (!/^(no|off|false|disabled)$/i.test(r) &&
              ("null" === r ? null : Number(r)))),
          (e[n] = r),
          e
        );
      }, {})),
      (e.exports = n(
        "./node_modules/builder-util-runtime/node_modules/debug/src/common.js"
      )(t));
    const { formatters: s } = e.exports;
    (s.o = function (e) {
      return (
        (this.inspectOpts.colors = this.useColors),
        i.inspect(e, this.inspectOpts).replace(/\s*\n\s*/g, " ")
      );
    }),
      (s.O = function (e) {
        return (
          (this.inspectOpts.colors = this.useColors),
          i.inspect(e, this.inspectOpts)
        );
      });
  },
  "./node_modules/builder-util-runtime/node_modules/ms/index.js": function (
    e,
    t
  ) {
    var n = 1e3,
      r = 6e4,
      i = 60 * r,
      s = 24 * i;
    function o(e, t, n, r) {
      var i = t >= 1.5 * n;
      return Math.round(e / n) + " " + r + (i ? "s" : "");
    }
    e.exports = function (e, t) {
      t = t || {};
      var a = typeof e;
      if ("string" === a && e.length > 0)
        return (function (e) {
          if ((e = String(e)).length > 100) return;
          var t = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
            e
          );
          if (!t) return;
          var o = parseFloat(t[1]);
          switch ((t[2] || "ms").toLowerCase()) {
            case "years":
            case "year":
            case "yrs":
            case "yr":
            case "y":
              return 315576e5 * o;
            case "weeks":
            case "week":
            case "w":
              return 6048e5 * o;
            case "days":
            case "day":
            case "d":
              return o * s;
            case "hours":
            case "hour":
            case "hrs":
            case "hr":
            case "h":
              return o * i;
            case "minutes":
            case "minute":
            case "mins":
            case "min":
            case "m":
              return o * r;
            case "seconds":
            case "second":
            case "secs":
            case "sec":
            case "s":
              return o * n;
            case "milliseconds":
            case "millisecond":
            case "msecs":
            case "msec":
            case "ms":
              return o;
            default:
              return;
          }
        })(e);
      if ("number" === a && isFinite(e))
        return t.long
          ? (function (e) {
              var t = Math.abs(e);
              if (t >= s) return o(e, t, s, "day");
              if (t >= i) return o(e, t, i, "hour");
              if (t >= r) return o(e, t, r, "minute");
              if (t >= n) return o(e, t, n, "second");
              return e + " ms";
            })(e)
          : (function (e) {
              var t = Math.abs(e);
              if (t >= s) return Math.round(e / s) + "d";
              if (t >= i) return Math.round(e / i) + "h";
              if (t >= r) return Math.round(e / r) + "m";
              if (t >= n) return Math.round(e / n) + "s";
              return e + "ms";
            })(e);
      throw new Error(
        "val is not a non-empty string or a valid number. val=" +
          JSON.stringify(e)
      );
    };
  },
  "./node_modules/builder-util-runtime/out/CancellationToken.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("events");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.CancellationError = t.CancellationToken = void 0);
    class i extends r().EventEmitter {
      constructor(e) {
        super(),
          (this.parentCancelHandler = null),
          (this._parent = null),
          (this._cancelled = !1),
          null != e && (this.parent = e);
      }
      get cancelled() {
        return (
          this._cancelled || (null != this._parent && this._parent.cancelled)
        );
      }
      set parent(e) {
        this.removeParentCancelHandler(),
          (this._parent = e),
          (this.parentCancelHandler = () => this.cancel()),
          this._parent.onCancel(this.parentCancelHandler);
      }
      cancel() {
        (this._cancelled = !0), this.emit("cancel");
      }
      onCancel(e) {
        this.cancelled ? e() : this.once("cancel", e);
      }
      createPromise(e) {
        if (this.cancelled) return Promise.reject(new s());
        const t = () => {
          if (null != n)
            try {
              this.removeListener("cancel", n), (n = null);
            } catch (e) {}
        };
        let n = null;
        return new Promise((t, r) => {
          let i = null;
          (n = () => {
            try {
              null != i && (i(), (i = null));
            } finally {
              r(new s());
            }
          }),
            this.cancelled
              ? n()
              : (this.onCancel(n),
                e(t, r, (e) => {
                  i = e;
                }));
        })
          .then((e) => (t(), e))
          .catch((e) => {
            throw (t(), e);
          });
      }
      removeParentCancelHandler() {
        const e = this._parent;
        null != e &&
          null != this.parentCancelHandler &&
          (e.removeListener("cancel", this.parentCancelHandler),
          (this.parentCancelHandler = null));
      }
      dispose() {
        try {
          this.removeParentCancelHandler();
        } finally {
          this.removeAllListeners(), (this._parent = null);
        }
      }
    }
    t.CancellationToken = i;
    class s extends Error {
      constructor() {
        super("cancelled");
      }
    }
    t.CancellationError = s;
  },
  "./node_modules/builder-util-runtime/out/ProgressCallbackTransform.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("stream");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.ProgressCallbackTransform = void 0);
    class i extends r().Transform {
      constructor(e, t, n) {
        super(),
          (this.total = e),
          (this.cancellationToken = t),
          (this.onProgress = n),
          (this.start = Date.now()),
          (this.transferred = 0),
          (this.delta = 0),
          (this.nextUpdate = this.start + 1e3);
      }
      _transform(e, t, n) {
        if (this.cancellationToken.cancelled)
          return void n(new Error("cancelled"), null);
        (this.transferred += e.length), (this.delta += e.length);
        const r = Date.now();
        r >= this.nextUpdate &&
          this.transferred !== this.total &&
          ((this.nextUpdate = r + 1e3),
          this.onProgress({
            total: this.total,
            delta: this.delta,
            transferred: this.transferred,
            percent: (this.transferred / this.total) * 100,
            bytesPerSecond: Math.round(
              this.transferred / ((r - this.start) / 1e3)
            ),
          }),
          (this.delta = 0)),
          n(null, e);
      }
      _flush(e) {
        this.cancellationToken.cancelled
          ? e(new Error("cancelled"))
          : (this.onProgress({
              total: this.total,
              delta: this.delta,
              transferred: this.total,
              percent: 100,
              bytesPerSecond: Math.round(
                this.transferred / ((Date.now() - this.start) / 1e3)
              ),
            }),
            (this.delta = 0),
            e(null));
      }
    }
    t.ProgressCallbackTransform = i;
  },
  "./node_modules/builder-util-runtime/out/bintray.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/httpExecutor.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.BintrayClient = void 0);
    t.BintrayClient = class {
      constructor(e, t, n, r) {
        if (
          ((this.httpExecutor = t),
          (this.cancellationToken = n),
          (this.requestHeaders = null),
          null == e.owner)
        )
          throw new Error("owner is not specified");
        if (null == e.package) throw new Error("package is not specified");
        (this.repo = e.repo || "generic"),
          (this.packageName = e.package),
          (this.owner = e.owner),
          (this.user = e.user || e.owner),
          (this.component = e.component || null),
          (this.distribution = e.distribution || "stable"),
          (this.auth =
            null == r
              ? null
              : "Basic " + Buffer.from(`${this.user}:${r}`).toString("base64")),
          (this.basePath = `/packages/${this.owner}/${this.repo}/${this.packageName}`);
      }
      setRequestHeaders(e) {
        this.requestHeaders = e;
      }
      bintrayRequest(e, t, n = null, i, s) {
        return (0, r().parseJson)(
          this.httpExecutor.request(
            (0, r().configureRequestOptions)(
              {
                hostname: "api.bintray.com",
                path: e,
                headers: this.requestHeaders || void 0,
              },
              t,
              s
            ),
            i,
            n
          )
        );
      }
      getVersion(e) {
        return this.bintrayRequest(
          `${this.basePath}/versions/${e}`,
          this.auth,
          null,
          this.cancellationToken
        );
      }
      getVersionFiles(e) {
        return this.bintrayRequest(
          `${this.basePath}/versions/${e}/files`,
          this.auth,
          null,
          this.cancellationToken
        );
      }
      createVersion(e) {
        return this.bintrayRequest(
          this.basePath + "/versions",
          this.auth,
          { name: e },
          this.cancellationToken
        );
      }
      deleteVersion(e) {
        return this.bintrayRequest(
          `${this.basePath}/versions/${e}`,
          this.auth,
          null,
          this.cancellationToken,
          "DELETE"
        );
      }
    };
  },
  "./node_modules/builder-util-runtime/out/httpExecutor.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("crypto");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.createHttpError = p),
      (t.parseJson = function (e) {
        return e.then((e) =>
          null == e || 0 === e.length ? null : JSON.parse(e)
        );
      }),
      (t.configureRequestOptionsFromUrl = y),
      (t.configureRequestUrl = v),
      (t.safeGetHeader = x),
      (t.configureRequestOptions = b),
      (t.safeStringifyJson = D),
      (t.DigestTransform = t.HttpExecutor = t.HttpError = void 0);
    var i,
      s =
        (i = n(
          "./node_modules/builder-util-runtime/node_modules/debug/src/index.js"
        )) && i.__esModule
          ? i
          : { default: i },
      o = n("fs");
    function a() {
      const e = n("stream");
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      const e = n("url");
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    function c() {
      const e = n(
        "./node_modules/builder-util-runtime/out/CancellationToken.js"
      );
      return (
        (c = function () {
          return e;
        }),
        e
      );
    }
    function l() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (l = function () {
          return e;
        }),
        e
      );
    }
    function h() {
      const e = n(
        "./node_modules/builder-util-runtime/out/ProgressCallbackTransform.js"
      );
      return (
        (h = function () {
          return e;
        }),
        e
      );
    }
    const d = (0, s.default)("electron-builder");
    function p(e, t = null) {
      return new m(
        e.statusCode || -1,
        `${e.statusCode} ${e.statusMessage}` +
          (null == t ? "" : "\n" + JSON.stringify(t, null, "  ")) +
          "\nHeaders: " +
          D(e.headers),
        t
      );
    }
    const f = new Map([
      [429, "Too many requests"],
      [400, "Bad request"],
      [403, "Forbidden"],
      [404, "Not found"],
      [405, "Method not allowed"],
      [406, "Not acceptable"],
      [408, "Request timeout"],
      [413, "Request entity too large"],
      [500, "Internal server error"],
      [502, "Bad gateway"],
      [503, "Service unavailable"],
      [504, "Gateway timeout"],
      [505, "HTTP version not supported"],
    ]);
    class m extends Error {
      constructor(e, t = "HTTP error: " + (f.get(e) || e), n = null) {
        super(t),
          (this.statusCode = e),
          (this.description = n),
          (this.name = "HttpError"),
          (this.code = "HTTP_ERROR_" + e);
      }
    }
    t.HttpError = m;
    class g {
      constructor() {
        this.maxRedirects = 10;
      }
      request(e, t = new (c().CancellationToken)(), n) {
        b(e);
        const r = null == n ? void 0 : Buffer.from(JSON.stringify(n));
        return (
          null != r &&
            ((e.method = "post"),
            (e.headers["Content-Type"] = "application/json"),
            (e.headers["Content-Length"] = r.length)),
          this.doApiRequest(e, t, (e) => {
            e.end(r);
          })
        );
      }
      doApiRequest(e, t, n, r = 0) {
        return (
          d.enabled && d("Request: " + D(e)),
          t.createPromise((i, s, o) => {
            const a = this.createRequest(e, (o) => {
              try {
                this.handleResponse(o, e, t, i, s, r, n);
              } catch (e) {
                s(e);
              }
            });
            this.addErrorAndTimeoutHandlers(a, s),
              this.addRedirectHandlers(a, e, s, r, (e) => {
                this.doApiRequest(e, t, n, r).then(i).catch(s);
              }),
              n(a, s),
              o(() => a.abort());
          })
        );
      }
      addRedirectHandlers(e, t, n, r, i) {}
      addErrorAndTimeoutHandlers(e, t) {
        this.addTimeOutHandler(e, t),
          e.on("error", t),
          e.on("aborted", () => {
            t(new Error("Request has been aborted by the server"));
          });
      }
      handleResponse(e, t, n, r, i, s, o) {
        if (
          (d.enabled &&
            d(
              `Response: ${e.statusCode} ${
                e.statusMessage
              }, request options: ${D(t)}`
            ),
          404 === e.statusCode)
        )
          return void i(
            p(
              e,
              `method: ${t.method || "GET"} url: ${t.protocol || "https:"}//${
                t.hostname
              }${t.port ? ":" + t.port : ""}${
                t.path
              }\n\nPlease double check that your authentication token is correct. Due to security reasons actual status maybe not reported, but 404.\n`
            )
          );
        if (204 === e.statusCode) return void r();
        const a = x(e, "location");
        if (null != a)
          return s > this.maxRedirects
            ? void i(this.createMaxRedirectError())
            : void this.doApiRequest(g.prepareRedirectUrlOptions(a, t), n, o, s)
                .then(r)
                .catch(i);
        e.setEncoding("utf8");
        let u = "";
        e.on("error", i),
          e.on("data", (e) => (u += e)),
          e.on("end", () => {
            try {
              if (null != e.statusCode && e.statusCode >= 400) {
                const t = x(e, "content-type"),
                  n =
                    null != t &&
                    (Array.isArray(t)
                      ? null != t.find((e) => e.includes("json"))
                      : t.includes("json"));
                i(p(e, n ? JSON.parse(u) : u));
              } else r(0 === u.length ? null : u);
            } catch (e) {
              i(e);
            }
          });
      }
      async downloadToBuffer(e, t) {
        return await t.cancellationToken.createPromise((n, r, i) => {
          let s = null;
          const o = { headers: t.headers || void 0, redirect: "manual" };
          v(e, o),
            b(o),
            this.doDownload(
              o,
              {
                destination: null,
                options: t,
                onCancel: i,
                callback: (e) => {
                  null == e ? n(s) : r(e);
                },
                responseHandler: (e, t) => {
                  const n = x(e, "content-length");
                  let r = -1;
                  if (null != n) {
                    const e = parseInt(n, 10);
                    if (e > 0) {
                      if (e > 52428800)
                        return void t(
                          new Error("Maximum allowed size is 50 MB")
                        );
                      (s = Buffer.alloc(e)), (r = 0);
                    }
                  }
                  e.on("data", (e) => {
                    if (-1 !== r) e.copy(s, r), (r += e.length);
                    else if (null == s) s = e;
                    else {
                      if (s.length > 52428800)
                        return void t(
                          new Error("Maximum allowed size is 50 MB")
                        );
                      s = Buffer.concat([s, e]);
                    }
                  }),
                    e.on("end", () => {
                      null != s && -1 !== r && r !== s.length
                        ? t(
                            new Error(
                              `Received data length ${r} is not equal to expected ${s.length}`
                            )
                          )
                        : t(null);
                    });
                },
              },
              0
            );
        });
      }
      doDownload(e, t, n) {
        const r = this.createRequest(e, (r) => {
          if (r.statusCode >= 400)
            return void t.callback(
              new Error(
                `Cannot download "${e.protocol || "https:"}//${e.hostname}${
                  e.path
                }", status ${r.statusCode}: ${r.statusMessage}`
              )
            );
          r.on("error", t.callback);
          const i = x(r, "location");
          null == i
            ? null == t.responseHandler
              ? (function (e, t) {
                  if (
                    !(function (e, t, n) {
                      if (null != e && null != t && e !== t)
                        return (
                          n(
                            new Error(
                              `checksum mismatch: expected ${t} but got ${e} (X-Checksum-Sha2 header)`
                            )
                          ),
                          !1
                        );
                      return !0;
                    })(x(t, "X-Checksum-Sha2"), e.options.sha2, e.callback)
                  )
                    return;
                  const n = [];
                  if (null != e.options.onProgress) {
                    const r = x(t, "content-length");
                    null != r &&
                      n.push(
                        new (h().ProgressCallbackTransform)(
                          parseInt(r, 10),
                          e.options.cancellationToken,
                          e.options.onProgress
                        )
                      );
                  }
                  const r = e.options.sha512;
                  null != r
                    ? n.push(
                        new E(
                          r,
                          "sha512",
                          128 !== r.length ||
                          r.includes("+") ||
                          r.includes("Z") ||
                          r.includes("=")
                            ? "base64"
                            : "hex"
                        )
                      )
                    : null != e.options.sha2 &&
                      n.push(new E(e.options.sha2, "sha256", "hex"));
                  const i = (0, o.createWriteStream)(e.destination);
                  n.push(i);
                  let s = t;
                  for (const t of n)
                    t.on("error", (t) => {
                      e.options.cancellationToken.cancelled || e.callback(t);
                    }),
                      (s = s.pipe(t));
                  i.on("finish", () => {
                    i.close(e.callback);
                  });
                })(t, r)
              : t.responseHandler(r, t.callback)
            : n < this.maxRedirects
            ? this.doDownload(g.prepareRedirectUrlOptions(i, e), t, n++)
            : t.callback(this.createMaxRedirectError());
        });
        this.addErrorAndTimeoutHandlers(r, t.callback),
          this.addRedirectHandlers(r, e, t.callback, n, (e) => {
            this.doDownload(e, t, n++);
          }),
          r.end();
      }
      createMaxRedirectError() {
        return new Error(`Too many redirects (> ${this.maxRedirects})`);
      }
      addTimeOutHandler(e, t) {
        e.on("socket", (n) => {
          n.setTimeout(6e4, () => {
            e.abort(), t(new Error("Request timed out"));
          });
        });
      }
      static prepareRedirectUrlOptions(e, t) {
        const n = y(e, { ...t }),
          r = n.headers;
        if (
          null != r &&
          null != r.authorization &&
          r.authorization.startsWith("token")
        ) {
          new (u().URL)(e).hostname.endsWith(".amazonaws.com") &&
            delete r.authorization;
        }
        return n;
      }
    }
    function y(e, t) {
      const n = b(t);
      return v(new (u().URL)(e), n), n;
    }
    function v(e, t) {
      (t.protocol = e.protocol),
        (t.hostname = e.hostname),
        e.port ? (t.port = e.port) : t.port && delete t.port,
        (t.path = e.pathname + e.search);
    }
    t.HttpExecutor = g;
    class E extends a().Transform {
      constructor(e, t = "sha512", n = "base64") {
        super(),
          (this.expected = e),
          (this.algorithm = t),
          (this.encoding = n),
          (this._actual = null),
          (this.isValidateOnEnd = !0),
          (this.digester = (0, r().createHash)(t));
      }
      get actual() {
        return this._actual;
      }
      _transform(e, t, n) {
        this.digester.update(e), n(null, e);
      }
      _flush(e) {
        if (
          ((this._actual = this.digester.digest(this.encoding)),
          this.isValidateOnEnd)
        )
          try {
            this.validate();
          } catch (t) {
            return void e(t);
          }
        e(null);
      }
      validate() {
        if (null == this._actual)
          throw (0, l().newError)(
            "Not finished yet",
            "ERR_STREAM_NOT_FINISHED"
          );
        if (this._actual !== this.expected)
          throw (0, l().newError)(
            `${this.algorithm} checksum mismatch, expected ${this.expected}, got ${this._actual}`,
            "ERR_CHECKSUM_MISMATCH"
          );
        return null;
      }
    }
    function x(e, t) {
      const n = e.headers[t];
      return null == n
        ? null
        : Array.isArray(n)
        ? 0 === n.length
          ? null
          : n[n.length - 1]
        : n;
    }
    function b(e, t, n) {
      null != n && (e.method = n), (e.headers = { ...e.headers });
      const r = e.headers;
      return (
        null != t &&
          (r.authorization = t.startsWith("Basic") ? t : "token " + t),
        null == r["User-Agent"] && (r["User-Agent"] = "electron-builder"),
        (null != n && "GET" !== n && null != r["Cache-Control"]) ||
          (r["Cache-Control"] = "no-cache"),
        null == e.protocol &&
          null != process.versions.electron &&
          (e.protocol = "https:"),
        e
      );
    }
    function D(e, t) {
      return JSON.stringify(
        e,
        (e, n) =>
          e.endsWith("authorization") ||
          e.endsWith("Password") ||
          e.endsWith("PASSWORD") ||
          e.endsWith("Token") ||
          e.includes("password") ||
          e.includes("token") ||
          (null != t && t.has(e))
            ? "<stripped sensitive data>"
            : n,
        2
      );
    }
    t.DigestTransform = E;
  },
  "./node_modules/builder-util-runtime/out/index.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n(
        "./node_modules/builder-util-runtime/out/CancellationToken.js"
      );
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/builder-util-runtime/out/httpExecutor.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("./node_modules/builder-util-runtime/out/publishOptions.js");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n("./node_modules/builder-util-runtime/out/xml.js");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.asArray = function (e) {
        return null == e ? [] : Array.isArray(e) ? e : [e];
      }),
      (t.newError = function (e, t) {
        const n = new Error(e);
        return (n.code = t), n;
      }),
      Object.defineProperty(t, "CancellationToken", {
        enumerable: !0,
        get: function () {
          return r().CancellationToken;
        },
      }),
      Object.defineProperty(t, "CancellationError", {
        enumerable: !0,
        get: function () {
          return r().CancellationError;
        },
      }),
      Object.defineProperty(t, "HttpError", {
        enumerable: !0,
        get: function () {
          return i().HttpError;
        },
      }),
      Object.defineProperty(t, "createHttpError", {
        enumerable: !0,
        get: function () {
          return i().createHttpError;
        },
      }),
      Object.defineProperty(t, "HttpExecutor", {
        enumerable: !0,
        get: function () {
          return i().HttpExecutor;
        },
      }),
      Object.defineProperty(t, "DigestTransform", {
        enumerable: !0,
        get: function () {
          return i().DigestTransform;
        },
      }),
      Object.defineProperty(t, "safeGetHeader", {
        enumerable: !0,
        get: function () {
          return i().safeGetHeader;
        },
      }),
      Object.defineProperty(t, "configureRequestOptions", {
        enumerable: !0,
        get: function () {
          return i().configureRequestOptions;
        },
      }),
      Object.defineProperty(t, "configureRequestOptionsFromUrl", {
        enumerable: !0,
        get: function () {
          return i().configureRequestOptionsFromUrl;
        },
      }),
      Object.defineProperty(t, "safeStringifyJson", {
        enumerable: !0,
        get: function () {
          return i().safeStringifyJson;
        },
      }),
      Object.defineProperty(t, "parseJson", {
        enumerable: !0,
        get: function () {
          return i().parseJson;
        },
      }),
      Object.defineProperty(t, "configureRequestUrl", {
        enumerable: !0,
        get: function () {
          return i().configureRequestUrl;
        },
      }),
      Object.defineProperty(t, "getS3LikeProviderBaseUrl", {
        enumerable: !0,
        get: function () {
          return s().getS3LikeProviderBaseUrl;
        },
      }),
      Object.defineProperty(t, "githubUrl", {
        enumerable: !0,
        get: function () {
          return s().githubUrl;
        },
      }),
      Object.defineProperty(t, "parseDn", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n(
              "./node_modules/builder-util-runtime/out/rfc2253Parser.js"
            );
            return (
              function () {
                return e;
              },
              e
            );
          })().parseDn;
        },
      }),
      Object.defineProperty(t, "UUID", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n("./node_modules/builder-util-runtime/out/uuid.js");
            return (
              function () {
                return e;
              },
              e
            );
          })().UUID;
        },
      }),
      Object.defineProperty(t, "ProgressCallbackTransform", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n(
              "./node_modules/builder-util-runtime/out/ProgressCallbackTransform.js"
            );
            return (
              function () {
                return e;
              },
              e
            );
          })().ProgressCallbackTransform;
        },
      }),
      Object.defineProperty(t, "parseXml", {
        enumerable: !0,
        get: function () {
          return o().parseXml;
        },
      }),
      Object.defineProperty(t, "XElement", {
        enumerable: !0,
        get: function () {
          return o().XElement;
        },
      }),
      (t.CURRENT_APP_PACKAGE_FILE_NAME = t.CURRENT_APP_INSTALLER_FILE_NAME = void 0);
    t.CURRENT_APP_INSTALLER_FILE_NAME = "installer.exe";
    t.CURRENT_APP_PACKAGE_FILE_NAME = "package.7z";
  },
  "./node_modules/builder-util-runtime/out/publishOptions.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r(e, t) {
      return (
        null != t &&
          t.length > 0 &&
          (t.startsWith("/") || (e += "/"), (e += t)),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.githubUrl = function (e, t = "github.com") {
        return `${e.protocol || "https"}://${e.host || t}`;
      }),
      (t.getS3LikeProviderBaseUrl = function (e) {
        const t = e.provider;
        if ("s3" === t)
          return (function (e) {
            let t;
            if (null != e.endpoint) t = `${e.endpoint}/${e.bucket}`;
            else if (e.bucket.includes(".")) {
              if (null == e.region)
                throw new Error(
                  `Bucket name "${e.bucket}" includes a dot, but S3 region is missing`
                );
              t =
                "us-east-1" === e.region
                  ? "https://s3.amazonaws.com/" + e.bucket
                  : `https://s3-${e.region}.amazonaws.com/${e.bucket}`;
            } else
              t =
                "cn-north-1" === e.region
                  ? `https://${e.bucket}.s3.${e.region}.amazonaws.com.cn`
                  : `https://${e.bucket}.s3.amazonaws.com`;
            return r(t, e.path);
          })(e);
        if ("spaces" === t)
          return (function (e) {
            if (null == e.name) throw new Error("name is missing");
            if (null == e.region) throw new Error("region is missing");
            return r(
              `https://${e.name}.${e.region}.digitaloceanspaces.com`,
              e.path
            );
          })(e);
        throw new Error("Not supported provider: " + t);
      });
  },
  "./node_modules/builder-util-runtime/out/rfc2253Parser.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.parseDn = function (e) {
        let t = !1,
          n = null,
          r = "",
          i = 0;
        e = e.trim();
        const s = new Map();
        for (let o = 0; o <= e.length; o++) {
          if (o === e.length) {
            null !== n && s.set(n, r);
            break;
          }
          const a = e[o];
          if (t) {
            if ('"' === a) {
              t = !1;
              continue;
            }
          } else {
            if ('"' === a) {
              t = !0;
              continue;
            }
            if ("\\" === a) {
              o++;
              const t = parseInt(e.slice(o, o + 2), 16);
              Number.isNaN(t)
                ? (r += e[o])
                : (o++, (r += String.fromCharCode(t)));
              continue;
            }
            if (null === n && "=" === a) {
              (n = r), (r = "");
              continue;
            }
            if ("," === a || ";" === a || "+" === a) {
              null !== n && s.set(n, r), (n = null), (r = "");
              continue;
            }
          }
          if (" " === a && !t) {
            if (0 === r.length) continue;
            if (o > i) {
              let t = o;
              for (; " " === e[t]; ) t++;
              i = t;
            }
            if (
              i >= e.length ||
              "," === e[i] ||
              ";" === e[i] ||
              (null === n && "=" === e[i]) ||
              (null !== n && "+" === e[i])
            ) {
              o = i - 1;
              continue;
            }
          }
          r += a;
        }
        return s;
      });
  },
  "./node_modules/builder-util-runtime/out/uuid.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("crypto");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.nil = t.UUID = void 0);
    const s = (0, r().randomBytes)(16);
    s[0] = 1 | s[0];
    const o = {},
      a = [];
    for (let e = 0; e < 256; e++) {
      const t = (e + 256).toString(16).substr(1);
      (o[t] = e), (a[e] = t);
    }
    class u {
      constructor(e) {
        (this.ascii = null), (this.binary = null);
        const t = u.check(e);
        if (!t) throw new Error("not a UUID");
        (this.version = t.version),
          "ascii" === t.format ? (this.ascii = e) : (this.binary = e);
      }
      static v5(e, t) {
        return (function (e, t, n, s, o = l.ASCII) {
          const c = (0, r().createHash)(t);
          if ("string" != typeof e && !Buffer.isBuffer(e))
            throw (0, i().newError)(
              "options.name must be either a string or a Buffer",
              "ERR_INVALID_UUID_NAME"
            );
          c.update(s), c.update(e);
          const h = c.digest();
          let d;
          switch (o) {
            case l.BINARY:
              (h[6] = (15 & h[6]) | n), (h[8] = (63 & h[8]) | 128), (d = h);
              break;
            case l.OBJECT:
              (h[6] = (15 & h[6]) | n),
                (h[8] = (63 & h[8]) | 128),
                (d = new u(h));
              break;
            default:
              d =
                a[h[0]] +
                a[h[1]] +
                a[h[2]] +
                a[h[3]] +
                "-" +
                a[h[4]] +
                a[h[5]] +
                "-" +
                a[(15 & h[6]) | n] +
                a[h[7]] +
                "-" +
                a[(63 & h[8]) | 128] +
                a[h[9]] +
                "-" +
                a[h[10]] +
                a[h[11]] +
                a[h[12]] +
                a[h[13]] +
                a[h[14]] +
                a[h[15]];
          }
          return d;
        })(e, "sha1", 80, t);
      }
      toString() {
        var e;
        return (
          null == this.ascii &&
            (this.ascii =
              ((e = this.binary),
              a[e[0]] +
                a[e[1]] +
                a[e[2]] +
                a[e[3]] +
                "-" +
                a[e[4]] +
                a[e[5]] +
                "-" +
                a[e[6]] +
                a[e[7]] +
                "-" +
                a[e[8]] +
                a[e[9]] +
                "-" +
                a[e[10]] +
                a[e[11]] +
                a[e[12]] +
                a[e[13]] +
                a[e[14]] +
                a[e[15]])),
          this.ascii
        );
      }
      inspect() {
        return `UUID v${this.version} ${this.toString()}`;
      }
      static check(e, t = 0) {
        if ("string" == typeof e)
          return (
            (e = e.toLowerCase()),
            !!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-([a-f0-9]{12})$/.test(e) &&
              ("00000000-0000-0000-0000-000000000000" === e
                ? { version: void 0, variant: "nil", format: "ascii" }
                : {
                    version: (240 & o[e[14] + e[15]]) >> 4,
                    variant: c((224 & o[e[19] + e[20]]) >> 5),
                    format: "ascii",
                  })
          );
        if (Buffer.isBuffer(e)) {
          if (e.length < t + 16) return !1;
          let n = 0;
          for (; n < 16 && 0 === e[t + n]; n++);
          return 16 === n
            ? { version: void 0, variant: "nil", format: "binary" }
            : {
                version: (240 & e[t + 6]) >> 4,
                variant: c((224 & e[t + 8]) >> 5),
                format: "binary",
              };
        }
        throw (0, i().newError)(
          "Unknown type of uuid",
          "ERR_UNKNOWN_UUID_TYPE"
        );
      }
      static parse(e) {
        const t = Buffer.allocUnsafe(16);
        let n = 0;
        for (let r = 0; r < 16; r++)
          (t[r] = o[e[n++] + e[n++]]),
            (3 !== r && 5 !== r && 7 !== r && 9 !== r) || (n += 1);
        return t;
      }
    }
    function c(e) {
      switch (e) {
        case 0:
        case 1:
        case 3:
          return "ncs";
        case 4:
        case 5:
          return "rfc4122";
        case 6:
          return "microsoft";
        default:
          return "future";
      }
    }
    var l;
    (t.UUID = u),
      (u.OID = u.parse("6ba7b812-9dad-11d1-80b4-00c04fd430c8")),
      (function (e) {
        (e[(e.ASCII = 0)] = "ASCII"),
          (e[(e.BINARY = 1)] = "BINARY"),
          (e[(e.OBJECT = 2)] = "OBJECT");
      })(l || (l = {}));
    const h = new u("00000000-0000-0000-0000-000000000000");
    t.nil = h;
  },
  "./node_modules/builder-util-runtime/out/xml.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = (function (e) {
        if (e && e.__esModule) return e;
        if (null === e || ("object" != typeof e && "function" != typeof e))
          return { default: e };
        var t = s();
        if (t && t.has(e)) return t.get(e);
        var n = {},
          r = Object.defineProperty && Object.getOwnPropertyDescriptor;
        for (var i in e)
          if (Object.prototype.hasOwnProperty.call(e, i)) {
            var o = r ? Object.getOwnPropertyDescriptor(e, i) : null;
            o && (o.get || o.set)
              ? Object.defineProperty(n, i, o)
              : (n[i] = e[i]);
          }
        (n.default = e), t && t.set(e, n);
        return n;
      })(n("./node_modules/sax/lib/sax.js"));
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.parseXml = function (e) {
        let t = null;
        const n = r().parser(!0, {}),
          i = [];
        return (
          (n.onopentag = (e) => {
            const n = new o(e.name);
            if (((n.attributes = e.attributes), null === t)) t = n;
            else {
              const e = i[i.length - 1];
              null == e.elements && (e.elements = []), e.elements.push(n);
            }
            i.push(n);
          }),
          (n.onclosetag = () => {
            i.pop();
          }),
          (n.ontext = (e) => {
            i.length > 0 && (i[i.length - 1].value = e);
          }),
          (n.oncdata = (e) => {
            const t = i[i.length - 1];
            (t.value = e), (t.isCData = !0);
          }),
          (n.onerror = (e) => {
            throw e;
          }),
          n.write(e),
          t
        );
      }),
      (t.XElement = void 0);
    class o {
      constructor(e) {
        if (
          ((this.name = e),
          (this.value = ""),
          (this.attributes = null),
          (this.isCData = !1),
          (this.elements = null),
          !e)
        )
          throw (0, i().newError)(
            "Element name cannot be empty",
            "ERR_XML_ELEMENT_NAME_EMPTY"
          );
        if (
          !(function (e) {
            return a.test(e);
          })(e)
        )
          throw (0, i().newError)(
            "Invalid element name: " + e,
            "ERR_XML_ELEMENT_INVALID_NAME"
          );
      }
      attribute(e) {
        const t = null === this.attributes ? null : this.attributes[e];
        if (null == t)
          throw (0, i().newError)(
            `No attribute "${e}"`,
            "ERR_XML_MISSED_ATTRIBUTE"
          );
        return t;
      }
      removeAttribute(e) {
        null !== this.attributes && delete this.attributes[e];
      }
      element(e, t = !1, n = null) {
        const r = this.elementOrNull(e, t);
        if (null === r)
          throw (0, i().newError)(
            n || `No element "${e}"`,
            "ERR_XML_MISSED_ELEMENT"
          );
        return r;
      }
      elementOrNull(e, t = !1) {
        if (null === this.elements) return null;
        for (const n of this.elements) if (u(n, e, t)) return n;
        return null;
      }
      getElements(e, t = !1) {
        return null === this.elements
          ? []
          : this.elements.filter((n) => u(n, e, t));
      }
      elementValueOrEmpty(e, t = !1) {
        const n = this.elementOrNull(e, t);
        return null === n ? "" : n.value;
      }
    }
    t.XElement = o;
    const a = new RegExp(/^[A-Za-z_][:A-Za-z0-9_-]*$/i);
    function u(e, t, n) {
      const r = e.name;
      return (
        r === t ||
        (!0 === n &&
          r.length === t.length &&
          r.toLowerCase() === t.toLowerCase())
      );
    }
  },
  "./node_modules/concat-map/index.js": function (e, t) {
    e.exports = function (e, t) {
      for (var r = [], i = 0; i < e.length; i++) {
        var s = t(e[i], i);
        n(s) ? r.push.apply(r, s) : r.push(s);
      }
      return r;
    };
    var n =
      Array.isArray ||
      function (e) {
        return "[object Array]" === Object.prototype.toString.call(e);
      };
  },
  "./node_modules/cross-unzip/index.js": function (e, t, n) {
    "use strict";
    var r = n("child_process").spawn,
      i = Array.prototype.slice,
      s =
        "win32" === process.platform
          ? function (e, t, r) {
              o(
                n("./node_modules/7zip/index.js")["7z"],
                ["x", e, "-y", "-o" + t],
                r
              );
            }
          : function (e, t, n) {
              o("unzip", ["-o", e, "-d", t], n);
            };
    function o(e, t, n) {
      var s, o;
      (s = n),
        (o = !1),
        (n = function () {
          o || ((o = !0), s.apply(this, i.call(arguments)));
        });
      var a = r(e, t, { stdio: "ignore" });
      a.on("error", function (e) {
        n(e);
      }),
        a.on("exit", function (e) {
          n(e ? new Error("Exited with code " + e) : null);
        });
    }
    (s.unzip = s), (e.exports = s);
  },
  "./node_modules/electron-devtools-installer/dist/downloadChromeExtension.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 });
    var r = u(n("fs")),
      i = u(n("path")),
      s = u(
        n(
          "./node_modules/electron-devtools-installer/node_modules/rimraf/rimraf.js"
        )
      ),
      o = u(n("./node_modules/cross-unzip/index.js")),
      a = n("./node_modules/electron-devtools-installer/dist/utils.js");
    function u(e) {
      return e && e.__esModule ? e : { default: e };
    }
    t.default = function e(t, n) {
      var u =
          arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 5,
        c = (0, a.getPath)();
      r.default.existsSync(c) || r.default.mkdirSync(c);
      var l = i.default.resolve(c + "/" + t);
      return new Promise(function (c, h) {
        if (!r.default.existsSync(l) || n) {
          r.default.existsSync(l) && s.default.sync(l);
          var d =
              "https://clients2.google.com/service/update2/crx?response=redirect&x=id%3D" +
              t +
              "%26uc&prodversion=32",
            p = i.default.resolve(l + ".crx");
          (0, a.downloadFile)(d, p)
            .then(function () {
              (0, o.default)(p, l, function (e) {
                if (
                  e &&
                  !r.default.existsSync(i.default.resolve(l, "manifest.json"))
                )
                  return h(e);
                (0, a.changePermissions)(l, 755), c(l);
              });
            })
            .catch(function (r) {
              if (
                (console.log(
                  "Failed to fetch extension, trying " + (u - 1) + " more times"
                ),
                u <= 1)
              )
                return h(r);
              setTimeout(function () {
                e(t, n, u - 1)
                  .then(c)
                  .catch(h);
              }, 200);
            });
        } else c(l);
      });
    };
  },
  "./node_modules/electron-devtools-installer/dist/index.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.MOBX_DEVTOOLS = t.APOLLO_DEVELOPER_TOOLS = t.CYCLEJS_DEVTOOL = t.REACT_PERF = t.REDUX_DEVTOOLS = t.VUEJS_DEVTOOLS = t.ANGULARJS_BATARANG = t.JQUERY_DEBUGGER = t.BACKBONE_DEBUGGER = t.REACT_DEVELOPER_TOOLS = t.EMBER_INSPECTOR = void 0);
    var r =
        "function" == typeof Symbol && "symbol" == typeof Symbol.iterator
          ? function (e) {
              return typeof e;
            }
          : function (e) {
              return e &&
                "function" == typeof Symbol &&
                e.constructor === Symbol &&
                e !== Symbol.prototype
                ? "symbol"
                : typeof e;
            },
      i = n("electron"),
      s = h(i),
      o = h(n("fs")),
      a = h(n("path")),
      u = h(n("./node_modules/semver/semver.js")),
      c = h(
        n(
          "./node_modules/electron-devtools-installer/dist/downloadChromeExtension.js"
        )
      ),
      l = n("./node_modules/electron-devtools-installer/dist/utils.js");
    function h(e) {
      return e && e.__esModule ? e : { default: e };
    }
    function d(e, t, n) {
      return (
        t in e
          ? Object.defineProperty(e, t, {
              value: n,
              enumerable: !0,
              configurable: !0,
              writable: !0,
            })
          : (e[t] = n),
        e
      );
    }
    var p = (i.remote || s.default).BrowserWindow,
      f = {},
      m = a.default.resolve((0, l.getPath)(), "IDMap.json");
    if (o.default.existsSync(m))
      try {
        f = JSON.parse(o.default.readFileSync(m, "utf8"));
      } catch (e) {
        console.error(
          "electron-devtools-installer: Invalid JSON present in the IDMap file"
        );
      }
    t.default = function e(t) {
      var n = arguments.length > 1 && void 0 !== arguments[1] && arguments[1];
      if (Array.isArray(t))
        return Promise.all(
          t.map(function (t) {
            return e(t, n);
          })
        );
      var i = void 0;
      if ("object" === (void 0 === t ? "undefined" : r(t)) && t.id) {
        i = t.id;
        var s = process.versions.electron.split("-")[0];
        if (!u.default.satisfies(s, t.electron))
          return Promise.reject(
            new Error(
              "Version of Electron: " +
                s +
                " does not match required range " +
                t.electron +
                " for extension " +
                i
            )
          );
      } else {
        if ("string" != typeof t)
          return Promise.reject(
            new Error('Invalid extensionReference passed in: "' + t + '"')
          );
        i = t;
      }
      var a = f[i],
        l = a && p.getDevToolsExtensions && p.getDevToolsExtensions()[a];
      return !n && l
        ? Promise.resolve(f[i])
        : (0, c.default)(i, n).then(function (e) {
            l && p.removeDevToolsExtension(a);
            var t = p.addDevToolsExtension(e);
            return (
              o.default.writeFileSync(
                m,
                JSON.stringify(Object.assign(f, d({}, i, t)))
              ),
              Promise.resolve(t)
            );
          });
    };
    (t.EMBER_INSPECTOR = {
      id: "bmdblncegkenkacieihfhpjfppoconhi",
      electron: ">=1.2.1",
    }),
      (t.REACT_DEVELOPER_TOOLS = {
        id: "fmkadmapgofadopljbjfkapdkoienihi",
        electron: ">=1.2.1",
      }),
      (t.BACKBONE_DEBUGGER = {
        id: "bhljhndlimiafopmmhjlgfpnnchjjbhd",
        electron: ">=1.2.1",
      }),
      (t.JQUERY_DEBUGGER = {
        id: "dbhhnnnpaeobfddmlalhnehgclcmjimi",
        electron: ">=1.2.1",
      }),
      (t.ANGULARJS_BATARANG = {
        id: "ighdmehidhipcmcojjgiloacoafjmpfk",
        electron: ">=1.2.1",
      }),
      (t.VUEJS_DEVTOOLS = {
        id: "nhdogjmejiglipccpnnnanhbledajbpd",
        electron: ">=1.2.1",
      }),
      (t.REDUX_DEVTOOLS = {
        id: "lmhkpmbekcpmknklioeibfkpmmfibljd",
        electron: ">=1.2.1",
      }),
      (t.REACT_PERF = {
        id: "hacmcodfllhbnekmghgdlplbdnahmhmm",
        electron: ">=1.2.6",
      }),
      (t.CYCLEJS_DEVTOOL = {
        id: "dfgplfmhhmdekalbpejekgfegkonjpfp",
        electron: ">=1.2.1",
      }),
      (t.APOLLO_DEVELOPER_TOOLS = {
        id: "jdkknkkbebbapilgoeccciglkfbmbnfm",
        electron: ">=1.2.1",
      }),
      (t.MOBX_DEVTOOLS = {
        id: "pfgnfdagidkfgccljigdamigbcnndkod",
        electron: ">=1.2.1",
      });
  },
  "./node_modules/electron-devtools-installer/dist/utils.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.changePermissions = t.downloadFile = t.getPath = void 0);
    var r = n("electron"),
      i = u(r),
      s = u(n("fs")),
      o = u(n("path")),
      a = u(n("https"));
    function u(e) {
      return e && e.__esModule ? e : { default: e };
    }
    t.getPath = function () {
      var e = (r.remote || i.default).app.getPath("userData");
      return o.default.resolve(e + "/extensions");
    };
    var c = (r.remote || i.default).net,
      l = c ? c.request : a.default.get;
    (t.downloadFile = function e(t, n) {
      return new Promise(function (r, i) {
        var o = l(t);
        o.on("response", function (t) {
          if (t.statusCode >= 300 && t.statusCode < 400 && t.headers.location)
            return e(t.headers.location, n).then(r).catch(i);
          t.pipe(s.default.createWriteStream(n)).on("close", r);
        }),
          o.on("error", i),
          o.end();
      });
    }),
      (t.changePermissions = function e(t, n) {
        s.default.readdirSync(t).forEach(function (r) {
          var i = o.default.join(t, r);
          s.default.chmodSync(i, parseInt(n, 8)),
            s.default.statSync(i).isDirectory() && e(i, n);
        });
      });
  },
  "./node_modules/electron-devtools-installer/node_modules/rimraf/rimraf.js": function (
    e,
    t,
    n
  ) {
    (e.exports = d), (d.sync = y);
    var r = n("assert"),
      i = n("path"),
      s = n("fs"),
      o = void 0;
    try {
      o = n("./node_modules/glob/glob.js");
    } catch (e) {}
    var a = parseInt("666", 8),
      u = { nosort: !0, silent: !0 },
      c = 0,
      l = "win32" === process.platform;
    function h(e) {
      if (
        (["unlink", "chmod", "stat", "lstat", "rmdir", "readdir"].forEach(
          function (t) {
            (e[t] = e[t] || s[t]), (e[(t += "Sync")] = e[t] || s[t]);
          }
        ),
        (e.maxBusyTries = e.maxBusyTries || 3),
        (e.emfileWait = e.emfileWait || 1e3),
        !1 === e.glob && (e.disableGlob = !0),
        !0 !== e.disableGlob && void 0 === o)
      )
        throw Error(
          "glob dependency not found, set `options.disableGlob = true` if intentional"
        );
      (e.disableGlob = e.disableGlob || !1), (e.glob = e.glob || u);
    }
    function d(e, t, n) {
      "function" == typeof t && ((n = t), (t = {})),
        r(e, "rimraf: missing path"),
        r.equal(typeof e, "string", "rimraf: path should be a string"),
        r.equal(typeof n, "function", "rimraf: callback function required"),
        r(t, "rimraf: invalid options argument provided"),
        r.equal(typeof t, "object", "rimraf: options should be object"),
        h(t);
      var i = 0,
        s = null,
        a = 0;
      if (t.disableGlob || !o.hasMagic(e)) return u(null, [e]);
      function u(e, r) {
        return e
          ? n(e)
          : 0 === (a = r.length)
          ? n()
          : void r.forEach(function (e) {
              p(e, t, function r(o) {
                if (o) {
                  if (
                    ("EBUSY" === o.code ||
                      "ENOTEMPTY" === o.code ||
                      "EPERM" === o.code) &&
                    i < t.maxBusyTries
                  )
                    return (
                      i++,
                      setTimeout(function () {
                        p(e, t, r);
                      }, 100 * i)
                    );
                  if ("EMFILE" === o.code && c < t.emfileWait)
                    return setTimeout(function () {
                      p(e, t, r);
                    }, c++);
                  "ENOENT" === o.code && (o = null);
                }
                (c = 0),
                  (function (e) {
                    (s = s || e), 0 == --a && n(s);
                  })(o);
              });
            });
      }
      t.lstat(e, function (n, r) {
        if (!n) return u(null, [e]);
        o(e, t.glob, u);
      });
    }
    function p(e, t, n) {
      r(e),
        r(t),
        r("function" == typeof n),
        t.lstat(e, function (r, i) {
          return r && "ENOENT" === r.code
            ? n(null)
            : (r && "EPERM" === r.code && l && f(e, t, r, n),
              i && i.isDirectory()
                ? g(e, t, r, n)
                : void t.unlink(e, function (r) {
                    if (r) {
                      if ("ENOENT" === r.code) return n(null);
                      if ("EPERM" === r.code)
                        return l ? f(e, t, r, n) : g(e, t, r, n);
                      if ("EISDIR" === r.code) return g(e, t, r, n);
                    }
                    return n(r);
                  }));
        });
    }
    function f(e, t, n, i) {
      r(e),
        r(t),
        r("function" == typeof i),
        n && r(n instanceof Error),
        t.chmod(e, a, function (r) {
          r
            ? i("ENOENT" === r.code ? null : n)
            : t.stat(e, function (r, s) {
                r
                  ? i("ENOENT" === r.code ? null : n)
                  : s.isDirectory()
                  ? g(e, t, n, i)
                  : t.unlink(e, i);
              });
        });
    }
    function m(e, t, n) {
      r(e), r(t), n && r(n instanceof Error);
      try {
        t.chmodSync(e, a);
      } catch (e) {
        if ("ENOENT" === e.code) return;
        throw n;
      }
      try {
        var i = t.statSync(e);
      } catch (e) {
        if ("ENOENT" === e.code) return;
        throw n;
      }
      i.isDirectory() ? v(e, t, n) : t.unlinkSync(e);
    }
    function g(e, t, n, s) {
      r(e),
        r(t),
        n && r(n instanceof Error),
        r("function" == typeof s),
        t.rmdir(e, function (o) {
          !o ||
          ("ENOTEMPTY" !== o.code && "EEXIST" !== o.code && "EPERM" !== o.code)
            ? o && "ENOTDIR" === o.code
              ? s(n)
              : s(o)
            : (function (e, t, n) {
                r(e),
                  r(t),
                  r("function" == typeof n),
                  t.readdir(e, function (r, s) {
                    if (r) return n(r);
                    var o,
                      a = s.length;
                    if (0 === a) return t.rmdir(e, n);
                    s.forEach(function (r) {
                      d(i.join(e, r), t, function (r) {
                        if (!o)
                          return r
                            ? n((o = r))
                            : void (0 == --a && t.rmdir(e, n));
                      });
                    });
                  });
              })(e, t, s);
        });
    }
    function y(e, t) {
      var n;
      if (
        (h((t = t || {})),
        r(e, "rimraf: missing path"),
        r.equal(typeof e, "string", "rimraf: path should be a string"),
        r(t, "rimraf: missing options"),
        r.equal(typeof t, "object", "rimraf: options should be object"),
        t.disableGlob || !o.hasMagic(e))
      )
        n = [e];
      else
        try {
          t.lstatSync(e), (n = [e]);
        } catch (r) {
          n = o.sync(e, t.glob);
        }
      if (n.length)
        for (var i = 0; i < n.length; i++) {
          e = n[i];
          try {
            var s = t.lstatSync(e);
          } catch (n) {
            if ("ENOENT" === n.code) return;
            "EPERM" === n.code && l && m(e, t, n);
          }
          try {
            s && s.isDirectory() ? v(e, t, null) : t.unlinkSync(e);
          } catch (n) {
            if ("ENOENT" === n.code) return;
            if ("EPERM" === n.code) return l ? m(e, t, n) : v(e, t, n);
            if ("EISDIR" !== n.code) throw n;
            v(e, t, n);
          }
        }
    }
    function v(e, t, n) {
      r(e), r(t), n && r(n instanceof Error);
      try {
        t.rmdirSync(e);
      } catch (s) {
        if ("ENOENT" === s.code) return;
        if ("ENOTDIR" === s.code) throw n;
        ("ENOTEMPTY" !== s.code && "EEXIST" !== s.code && "EPERM" !== s.code) ||
          (function (e, t) {
            r(e),
              r(t),
              t.readdirSync(e).forEach(function (n) {
                y(i.join(e, n), t);
              });
            var n = l ? 100 : 1,
              s = 0;
            for (;;) {
              var o = !0;
              try {
                var a = t.rmdirSync(e, t);
                return (o = !1), a;
              } finally {
                if (++s < n && o) continue;
              }
            }
          })(e, t);
      }
    }
  },
  "./node_modules/electron-log/src/catchErrors.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/electron-log/src/electronApi.js"),
      i = n("querystring"),
      s = !1;
    e.exports = function (e) {
      return (
        s ||
          ((s = !0),
          "renderer" === process.type
            ? (window.addEventListener("error", o),
              window.addEventListener("unhandledrejection", a))
            : (process.on("uncaughtException", t),
              process.on("unhandledRejection", n))),
        { stop: u }
      );
      function t(t) {
        try {
          if ("function" == typeof e.onError) {
            var n = r.getVersions();
            if (!1 === e.onError(t, n, c)) return;
          }
          if (
            (e.log(t), e.showDialog && t.name.indexOf("UnhandledRejection") < 0)
          ) {
            var i = process.type || "main";
            r.showErrorBox(
              "A JavaScript error occurred in the " + i + " process",
              t.stack
            );
          }
        } catch (e) {
          console.error(t);
        }
      }
      function n(e) {
        if (e instanceof Error) {
          var n = "UnhandledRejection " + e.name,
            r = Object.getPrototypeOf(e),
            i = Object.getOwnPropertyDescriptor(r, "name");
          return (
            (i && i.writable) || (e = new Error(e.message)),
            (e.name = n),
            void t(e)
          );
        }
        var s = new Error(JSON.stringify(e));
        (s.name = "UnhandledRejection"), t(s);
      }
      function o(e) {
        e.preventDefault(), t(e.error);
      }
      function a(e) {
        e.preventDefault(), n(e.reason);
      }
      function u() {
        (s = !1),
          "renderer" === process.type
            ? (window.removeEventListener("error", o),
              window.removeEventListener("unhandledrejection", a))
            : (process.removeListener("uncaughtException", t),
              process.removeListener("unhandledRejection", n));
      }
      function c(t, n) {
        var s = t + "?" + i.stringify(n);
        r.openUrl(s, e.log);
      }
    };
  },
  "./node_modules/electron-log/src/electronApi.js": function (e, t, n) {
    "use strict";
    var r;
    try {
      r = n("electron");
    } catch (e) {
      r = null;
    }
    var i = n("os");
    function s() {
      return a("app");
    }
    function o() {
      var e = s();
      return e ? ("name" in e ? e.name : e.getName()) : null;
    }
    function a(e) {
      return r ? (r[e] ? r[e] : r.remote ? r.remote[e] : null) : null;
    }
    function u() {
      return "browser" === process.type && r && r.ipcMain
        ? r.ipcMain
        : "renderer" === process.type && r && r.ipcRenderer
        ? r.ipcRenderer
        : null;
    }
    function c() {
      var e = s();
      return e ? ("version" in e ? e.version : e.getVersion()) : null;
    }
    function l() {
      var e = i.type().replace("_", " "),
        t = i.release();
      return (
        "Darwin" === e &&
          ((e = "macOS"),
          (t = "10." + (Number(i.release().split(".")[0]) - 4))),
        e + " " + t
      );
    }
    e.exports = {
      getName: o,
      getPath: function (e) {
        var t = s();
        if (!t) return null;
        try {
          return t.getPath(e);
        } catch (e) {
          return null;
        }
      },
      getVersion: c,
      getVersions: function () {
        return {
          app: o() + " " + c(),
          electron: "Electron " + process.versions.electron,
          os: l(),
        };
      },
      isDev: function () {
        var e = s();
        return !!e && (!e.isPackaged || "1" === process.env.ELECTRON_IS_DEV);
      },
      isElectron: function () {
        return "browser" === process.type || "renderer" === process.type;
      },
      isIpcChannelListened: function (e) {
        var t = u();
        return !!t && t.listenerCount(e) > 0;
      },
      loadRemoteModule: function (e) {
        if ("browser" === process.type)
          s().on("web-contents-created", function (t, n) {
            var r = n.executeJavaScript(
              'try {require("' + e + '")} catch(e){}; void 0;'
            );
            r && "function" == typeof r.catch && r.catch(function () {});
          });
        else if ("renderer" === process.type)
          try {
            (function () {
              if (r && r.remote) return r.remote;
              return null;
            })().require(e);
          } catch (e) {}
      },
      onIpc: function (e, t) {
        var n = u();
        n && n.on(e, t);
      },
      openUrl: function (e, t) {
        t = t || console.error;
        var n = a("shell");
        if (!n) return;
        n.openExternal(e).catch(t);
      },
      sendIpc: function (e, t) {
        "browser" === process.type
          ? (function (e, t) {
              if (!r || !r.BrowserWindow) return;
              r.BrowserWindow.getAllWindows().forEach(function (n) {
                n.webContents &&
                  !n.webContents.isDestroyed() &&
                  n.webContents.send(e, t);
              });
            })(e, t)
          : "renderer" === process.type &&
            (function (e, t) {
              var n = u();
              n && n.send(e, t);
            })(e, t);
      },
      showErrorBox: function (e, t) {
        var n = a("dialog");
        if (!n) return;
        n.showErrorBox(e, t);
      },
    };
  },
  "./node_modules/electron-log/src/index.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/electron-log/src/catchErrors.js"),
      i = n("./node_modules/electron-log/src/electronApi.js"),
      s = n("./node_modules/electron-log/src/log.js"),
      o = n("./node_modules/electron-log/src/scope.js"),
      a = n("./node_modules/electron-log/src/transports/console.js"),
      u = n("./node_modules/electron-log/src/transports/file/index.js"),
      c = n("./node_modules/electron-log/src/transports/ipc.js"),
      l = n("./node_modules/electron-log/src/transports/remote.js");
    (e.exports = (function e(t) {
      var n = {
        catchErrors: function (e) {
          var t = Object.assign(
            {},
            { log: n.error, showDialog: "browser" === process.type },
            e || {}
          );
          r(t);
        },
        create: e,
        functions: {},
        hooks: [],
        isDev: i.isDev(),
        levels: [],
        logId: t,
        variables: { processType: process.type },
      };
      return (
        (n.scope = o(n)),
        (n.transports = { console: a(n), file: u(n), remote: l(n), ipc: c(n) }),
        Object.defineProperty(n.levels, "add", {
          enumerable: !1,
          value: function (e, t) {
            (t = void 0 === t ? n.levels.length : t),
              n.levels.splice(t, 0, e),
              (n[e] = s.log.bind(null, n, { level: e })),
              (n.functions[e] = n[e]);
          },
        }),
        ["error", "warn", "info", "verbose", "debug", "silly"].forEach(
          function (e) {
            n.levels.add(e);
          }
        ),
        (n.log = s.log.bind(null, n, { level: "info" })),
        (n.functions.log = n.log),
        (n.logMessageWithTransports = function (e, t) {
          return s.runTransports(t, e, n);
        }),
        n
      );
    })("default")),
      (e.exports.default = e.exports);
  },
  "./node_modules/electron-log/src/log.js": function (e, t, n) {
    "use strict";
    function r(e, t, n) {
      for (var r in e)
        Object.prototype.hasOwnProperty.call(e, r) && i(e[r], t, n);
    }
    function i(e, t, n) {
      "function" == typeof e &&
        !1 !== e.level &&
        s(n.levels, e.level, t.level) &&
        (t = (function (e, t, n) {
          if (!e || !e.length) return n;
          for (var r = 0; r < e.length && (n = e[r](n, t)); r++);
          return n;
        })(n.hooks, e, t)) &&
        e(t);
    }
    function s(e, t, n) {
      var r = e.indexOf(t),
        i = e.indexOf(n);
      return -1 === i || -1 === r || i <= r;
    }
    e.exports = {
      compareLevels: s,
      log: function (e, t) {
        var n = e.transports,
          i = {
            data: Array.prototype.slice.call(arguments, 2),
            date: new Date(),
            level: t.level,
            scope: t.scope ? t.scope.toJSON() : null,
            variables: e.variables,
          };
        r(n, i, e);
      },
      runTransport: i,
      runTransports: r,
    };
  },
  "./node_modules/electron-log/src/scope.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/electron-log/src/log.js").log;
    e.exports = function (e) {
      return (
        (t.labelPadding = !0),
        (t.defaultLabel = ""),
        (t.maxLabelLength = 0),
        (t.getOptions = function () {
          return { defaultLabel: t.defaultLabel, labelLength: n() };
        }),
        t
      );
      function t(n) {
        var i = {
          label: n,
          toJSON: function () {
            return { label: this.label };
          },
        };
        return (
          e.levels.forEach(function (t) {
            i[t] = r.bind(null, e, { level: t, scope: i });
          }),
          (i.log = i.info),
          (t.maxLabelLength = Math.max(t.maxLabelLength, n.length)),
          i
        );
      }
      function n() {
        return !0 === t.labelPadding
          ? t.maxLabelLength
          : !1 === t.labelPadding
          ? 0
          : "number" == typeof t.labelPadding
          ? t.labelPadding
          : 0;
      }
    };
  },
  "./node_modules/electron-log/src/transform/index.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/electron-log/src/transform/object.js"),
      i = n("./node_modules/electron-log/src/transform/style.js"),
      s = n("./node_modules/electron-log/src/transform/template.js");
    function o(e, t, n) {
      return t.reduce(function (t, n) {
        return "function" == typeof n ? n(t, e) : t;
      }, n || e.data);
    }
    e.exports = {
      applyAnsiStyles: i.applyAnsiStyles,
      concatFirstStringElements: s.concatFirstStringElements,
      customFormatterFactory: function (e, t, n) {
        if ("string" == typeof e)
          return function (r, i) {
            return o(
              i,
              [
                s.templateVariables,
                s.templateScopeFactory(n),
                s.templateDate,
                s.templateText,
                t && s.concatFirstStringElements,
              ],
              [e].concat(r)
            );
          };
        if ("function" == typeof e)
          return function (t, n) {
            var r = Object.assign({}, n, { data: t }),
              i = e(r, t);
            return [].concat(i);
          };
        return function (e) {
          return [].concat(e);
        };
      },
      maxDepthFactory: r.maxDepthFactory,
      removeStyles: i.removeStyles,
      toJSON: r.toJSON,
      toStringFactory: r.toStringFactory,
      transform: o,
    };
  },
  "./node_modules/electron-log/src/transform/object.js": function (e, t, n) {
    "use strict";
    var r = n("util");
    function i() {
      var e = (function () {
        if ("undefined" != typeof WeakSet) return new WeakSet();
        var e = [];
        return (
          (this.add = function (t) {
            e.push(t);
          }),
          (this.has = function (t) {
            return -1 !== e.indexOf(t);
          }),
          this
        );
      })();
      return function (t, n) {
        if ("object" == typeof n && null !== n) {
          if (e.has(n)) return;
          e.add(n);
        }
        return s(t, n);
      };
    }
    function s(e, t) {
      return t instanceof Error
        ? t.stack
        : t
        ? "function" == typeof t.toJSON
          ? t.toJSON()
          : "function" == typeof t
          ? "[function] " + t.toString()
          : t
        : t;
    }
    e.exports = {
      maxDepthFactory: function (e) {
        return (
          (e = e || 6),
          function (t) {
            return (function e(t, n) {
              if (!t) return t;
              if (n < 1)
                return t.map
                  ? "[array]"
                  : "object" == typeof t
                  ? "[object]"
                  : t;
              if ("function" == typeof t.map)
                return t.map(function (t) {
                  return e(t, n - 1);
                });
              if ("object" != typeof t) return t;
              if (t && "function" == typeof t.toISOString) return t;
              if (null === t) return null;
              if (t instanceof Error) return t;
              var r = {};
              for (var i in t)
                Object.prototype.hasOwnProperty.call(t, i) &&
                  (r[i] = e(t[i], n - 1));
              return r;
            })(t, e);
          }
        );
      },
      serialize: s,
      toJSON: function (e) {
        return JSON.parse(JSON.stringify(e, i()));
      },
      toStringFactory: function (e) {
        return (
          (e = e || 5),
          function (t) {
            var n = t.map(function (e) {
              if (void 0 !== e) {
                var t = JSON.stringify(e, i(), "  ");
                if (void 0 !== t) return JSON.parse(t);
              }
            });
            return r.formatWithOptions
              ? (n.unshift({ depth: e }), r.formatWithOptions.apply(r, n))
              : r.format.apply(r, n);
          }
        );
      },
    };
  },
  "./node_modules/electron-log/src/transform/style.js": function (e, t, n) {
    "use strict";
    e.exports = {
      applyAnsiStyles: function (e) {
        return o(e, i, s);
      },
      removeStyles: function (e) {
        return o(e, function () {
          return "";
        });
      },
      transformStyles: o,
    };
    var r = {
      unset: "[0m",
      black: "[30m",
      red: "[31m",
      green: "[32m",
      yellow: "[33m",
      blue: "[34m",
      magenta: "[35m",
      cyan: "[36m",
      white: "[37m",
    };
    function i(e) {
      var t = e.replace(/color:\s*(\w+).*/, "$1").toLowerCase();
      return r[t] || "";
    }
    function s(e) {
      return e + r.unset;
    }
    function o(e, t, n) {
      var r = {};
      return e.reduce(function (e, i, s, o) {
        if (r[s]) return e;
        if ("string" == typeof i) {
          var a = s,
            u = !1;
          (i = i.replace(/%[1cdfiOos]/g, function (e) {
            if (((a += 1), "%c" !== e)) return e;
            var n = o[a];
            return "string" == typeof n ? ((r[a] = !0), (u = !0), t(n, i)) : e;
          })),
            u && n && (i = n(i));
        }
        return e.push(i), e;
      }, []);
    }
  },
  "./node_modules/electron-log/src/transform/template.js": function (e, t, n) {
    "use strict";
    function r(e, t) {
      return e
        .replace("{y}", String(t.getFullYear()))
        .replace("{m}", s(t.getMonth() + 1))
        .replace("{d}", s(t.getDate()))
        .replace("{h}", s(t.getHours()))
        .replace("{i}", s(t.getMinutes()))
        .replace("{s}", s(t.getSeconds()))
        .replace("{ms}", s(t.getMilliseconds(), 3))
        .replace("{z}", i(t.getTimezoneOffset()))
        .replace("{iso}", t.toISOString());
    }
    function i(e) {
      var t = Math.abs(e);
      return (e >= 0 ? "-" : "+") + s(Math.floor(t / 60)) + ":" + s(t % 60);
    }
    function s(e, t) {
      return (t = t || 2), (new Array(t + 1).join("0") + e).substr(-t, t);
    }
    function o(e, t) {
      return (
        (t = Math.max(t, e.length)),
        (e + Array(t + 1).join(" ")).substring(0, t)
      );
    }
    e.exports = {
      concatFirstStringElements: function (e) {
        if ("string" != typeof e[0] || "string" != typeof e[1]) return e;
        if (e[0].match(/%[1cdfiOos]/)) return e;
        return (e[1] = e[0] + " " + e[1]), e.shift(), e;
      },
      formatDate: r,
      formatTimeZone: i,
      pad: s,
      padString: o,
      templateDate: function (e, t) {
        var n = e[0];
        if ("string" != typeof n) return e;
        return (e[0] = r(n, t.date)), e;
      },
      templateVariables: function (e, t) {
        var n = e[0],
          r = t.variables;
        if ("string" != typeof n || !t.variables) return e;
        for (var i in r)
          Object.prototype.hasOwnProperty.call(r, i) &&
            (n = n.replace("{" + i + "}", r[i]));
        return (n = n.replace("{level}", t.level)), (e[0] = n), e;
      },
      templateScopeFactory: function (e) {
        var t = (e = e || {}).labelLength || 0;
        return function (n, r) {
          var i,
            s = n[0],
            a = r.scope && r.scope.label;
          return (
            a || (a = e.defaultLabel),
            (i =
              "" === a
                ? t > 0
                  ? o("", t + 3)
                  : ""
                : "string" == typeof a
                ? o(" (" + a + ")", t + 3)
                : ""),
            (n[0] = s.replace("{scope}", i)),
            n
          );
        };
      },
      templateText: function (e) {
        var t = e[0];
        if ("string" != typeof t) return e;
        if (t.lastIndexOf("{text}") === t.length - 6)
          return (
            (e[0] = t.replace(/\s?{text}/, "")), "" === e[0] && e.shift(), e
          );
        var n = t.split("{text}"),
          r = [];
        "" !== n[0] && r.push(n[0]);
        (r = r.concat(e.slice(1))), "" !== n[1] && r.push(n[1]);
        return r;
      },
    };
  },
  "./node_modules/electron-log/src/transports/console.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/electron-log/src/transform/index.js"),
      i = {
        context: console,
        error: console.error,
        warn: console.warn,
        info: console.info,
        verbose: console.verbose,
        debug: console.debug,
        silly: console.silly,
        log: console.log,
      };
    (e.exports = function (e) {
      return (
        (t.level = "silly"),
        (t.useStyles = process.env.FORCE_STYLES),
        (t.format = s[process.type] || s.browser),
        t
      );
      function t(n) {
        var r,
          s = e.scope.getOptions();
        (r =
          "renderer" === process.type || "worker" === process.type
            ? o(n, t, s)
            : a(n, t, s)),
          (function (e, t) {
            var n = i[e] || i.info;
            if ("renderer" === process.type)
              return void setTimeout(n.bind.apply(n, [n.context].concat(t)));
            n.apply(i.context, t);
          })(n.level, r);
      }
    }),
      (e.exports.transformRenderer = o),
      (e.exports.transformMain = a);
    var s = {
      browser:
        "%c{h}:{i}:{s}.{ms}{scope}%c " +
        ("win32" === process.platform ? ">" : "›") +
        " {text}",
      renderer: "{h}:{i}:{s}.{ms}{scope} › {text}",
      worker: "{h}:{i}:{s}.{ms}{scope} › {text}",
    };
    function o(e, t, n) {
      return r.transform(e, [r.customFormatterFactory(t.format, !0, n)]);
    }
    function a(e, t, n) {
      var i,
        o = (function (e, t) {
          if (!0 === e || !1 === e) return e;
          var n =
            "error" === t || "warn" === t ? process.stderr : process.stdout;
          return n && n.isTTY;
        })(t.useStyles, e.level);
      return r.transform(e, [
        ((i = t.format),
        function (e, t) {
          return i !== s.browser
            ? e
            : ["color:" + u(t.level), "color:unset"].concat(e);
        }),
        r.customFormatterFactory(t.format, !1, n),
        o ? r.applyAnsiStyles : r.removeStyles,
        r.concatFirstStringElements,
        r.maxDepthFactory(4),
        r.toJSON,
      ]);
    }
    function u(e) {
      switch (e) {
        case "error":
          return "red";
        case "warn":
          return "yellow";
        case "info":
          return "cyan";
        default:
          return "unset";
      }
    }
  },
  "./node_modules/electron-log/src/transports/file/file.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("events"),
      i = n("fs"),
      s = n("os"),
      o = n("path"),
      a = n("util");
    function u(e, t, n) {
      r.call(this),
        (this.path = e),
        (this.initialSize = void 0),
        (this.bytesWritten = 0),
        (this.writeAsync = Boolean(n)),
        (this.asyncWriteQueue = []),
        (this.writeOptions = t || { flag: "a", mode: 438, encoding: "utf8" }),
        Object.defineProperty(this, "size", { get: this.getSize.bind(this) });
    }
    function c(e) {
      u.call(this, e);
    }
    function l() {
      r.call(this),
        (this.store = {}),
        (this.emitError = this.emitError.bind(this));
    }
    (e.exports = { File: u, FileRegistry: l, NullFile: c }),
      a.inherits(u, r),
      (u.prototype.clear = function () {
        try {
          return (
            i.writeFileSync(this.path, "", {
              mode: this.writeOptions.mode,
              flag: "w",
            }),
            this.reset(),
            !0
          );
        } catch (e) {
          return "ENOENT" === e.code || (this.emit("error", e, this), !1);
        }
      }),
      (u.prototype.crop = function (e) {
        try {
          var t =
            ((n = this.path),
            (r = e || 4096),
            (o = Buffer.alloc(r)),
            (a = i.statSync(n)),
            (u = Math.min(a.size, r)),
            (c = Math.max(0, a.size - r)),
            (l = i.openSync(n, "r")),
            (h = i.readSync(l, o, 0, u, c)),
            i.closeSync(l),
            o.toString("utf8", 0, h));
          this.clear(), this.writeLine("[log cropped]" + s.EOL + t);
        } catch (e) {
          this.emit(
            "error",
            new Error("Couldn't crop file " + this.path + ". " + e.message),
            this
          );
        }
        var n, r, o, a, u, c, l, h;
      }),
      (u.prototype.toString = function () {
        return this.path;
      }),
      (u.prototype.reset = function () {
        (this.initialSize = void 0), (this.bytesWritten = 0);
      }),
      (u.prototype.writeLine = function (e) {
        if (((e += s.EOL), this.writeAsync))
          return this.asyncWriteQueue.push(e), void this.nextAsyncWrite();
        try {
          i.writeFileSync(this.path, e, this.writeOptions),
            this.increaseBytesWrittenCounter(e);
        } catch (e) {
          this.emit(
            "error",
            new Error("Couldn't write to " + this.path + ". " + e.message),
            this
          );
        }
      }),
      (u.prototype.getSize = function () {
        if (void 0 === this.initialSize)
          try {
            var e = i.statSync(this.path);
            this.initialSize = e.size;
          } catch (e) {
            this.initialSize = 0;
          }
        return this.initialSize + this.bytesWritten;
      }),
      (u.prototype.isNull = function () {
        return !1;
      }),
      (u.prototype.increaseBytesWrittenCounter = function (e) {
        this.bytesWritten += Buffer.byteLength(e, this.writeOptions.encoding);
      }),
      (u.prototype.nextAsyncWrite = function () {
        var e = this;
        if (!(this.asyncWriteQueue.length < 1)) {
          var t = this.asyncWriteQueue.shift();
          i.writeFile(this.path, t, this.writeOptions, function (n) {
            n
              ? e.emit(
                  "error",
                  new Error("Couldn't write to " + e.path + ". " + n.message),
                  this
                )
              : e.increaseBytesWrittenCounter(t),
              e.nextAsyncWrite();
          });
        }
      }),
      a.inherits(c, u),
      (c.prototype.clear = function () {}),
      (c.prototype.crop = function () {}),
      (c.prototype.writeLine = function () {}),
      (c.prototype.getSize = function () {
        return 0;
      }),
      (c.prototype.isNull = function () {
        return !0;
      }),
      a.inherits(l, r),
      (l.prototype.provide = function (e, t, n) {
        var r;
        try {
          if (((e = o.resolve(e)), this.store[e])) return this.store[e];
          r = this.createFile(e, t, Boolean(n));
        } catch (t) {
          (r = new c(e)), this.emitError(t, r);
        }
        return r.on("error", this.emitError), (this.store[e] = r), r;
      }),
      (l.prototype.createFile = function (e, t, n) {
        return this.testFileWriting(e), new u(e, t, n);
      }),
      (l.prototype.emitError = function (e, t) {
        this.emit("error", e, t);
      }),
      (l.prototype.testFileWriting = function (e) {
        !(function e(t) {
          if (
            (function (e) {
              if (!process.versions) return !1;
              return (
                Number(
                  process.version
                    .match(/^v(\d+\.\d+)/)[1]
                    .replace(/\.(\d)$/, ".0$1")
                ) >= e
              );
            })(10.12)
          )
            return i.mkdirSync(t, { recursive: !0 }), !0;
          try {
            return i.mkdirSync(t), !0;
          } catch (n) {
            if ("ENOENT" === n.code) return e(o.dirname(t)) && e(t);
            try {
              if (i.statSync(t).isDirectory()) return !0;
              throw n;
            } catch (e) {
              throw e;
            }
          }
        })(o.dirname(e)),
          i.writeFileSync(e, "", { flag: "a" });
      });
  },
  "./node_modules/electron-log/src/transports/file/index.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("fs"),
      i = n("path"),
      s = n("os"),
      o = n("util"),
      a = n("./node_modules/electron-log/src/transform/index.js"),
      u = n("./node_modules/electron-log/src/transports/file/file.js")
        .FileRegistry,
      c = n("./node_modules/electron-log/src/transports/file/variables.js");
    e.exports = function (e, t) {
      var n = c.getPathVariables(process.platform),
        u = t || l;
      u.listenerCount("error") < 1 &&
        u.on("error", function (e, t) {
          d("Can't write to " + t, e);
        });
      return (
        (h.archiveLog = function (e) {
          var t = e.toString(),
            n = i.parse(t);
          try {
            r.renameSync(t, i.join(n.dir, n.name + ".old" + n.ext));
          } catch (t) {
            d("Could not rotate log", t);
            var s = Math.round(h.maxSize / 4);
            e.crop(Math.min(s, 262144));
          }
        }),
        (h.depth = 5),
        (h.fileName = (function () {
          switch (process.type) {
            case "renderer":
              return "renderer.log";
            case "worker":
              return "worker.log";
            default:
              return "main.log";
          }
        })()),
        (h.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}"),
        (h.getFile = p),
        (h.level = "silly"),
        (h.maxSize = 1048576),
        (h.readAllLogs = function () {
          var e = Object.assign({}, n, { fileName: h.fileName }),
            t = i.dirname(h.resolvePath(e));
          return r
            .readdirSync(t)
            .map(function (e) {
              var n = i.join(t, e);
              try {
                return {
                  path: n,
                  lines: r.readFileSync(n, "utf8").split(s.EOL),
                };
              } catch (e) {
                return null;
              }
            })
            .filter(Boolean);
        }),
        (h.resolvePath = function (e) {
          return i.join(e.libraryDefaultDir, e.fileName);
        }),
        (h.sync = !0),
        (h.writeOptions = { flag: "a", mode: 438, encoding: "utf8" }),
        (function () {
          var e = " is deprecated and will be removed in v5.",
            t = " property" + e;
          function n() {
            return p().path;
          }
          Object.defineProperties(h, {
            bytesWritten: {
              get: o.deprecate(function () {
                return p().bytesWritten;
              }, "bytesWritten" + t),
            },
            file: {
              get: o.deprecate(n, "file" + t),
              set: o.deprecate(function (e) {
                h.resolvePath = function () {
                  return e;
                };
              }, "file" + t),
            },
            fileSize: {
              get: o.deprecate(function () {
                return p().size;
              }, "file" + t),
            },
          }),
            (h.clear = o.deprecate(function () {
              p().clear();
            }, "clear()" + e)),
            (h.findLogPath = o.deprecate(n, "findLogPath()" + e)),
            (h.init = o.deprecate(function () {}, "init()" + e));
        })(),
        h
      );
      function h(t) {
        var n = p(t);
        h.maxSize > 0 && n.size > h.maxSize && (h.archiveLog(n), n.reset());
        var r = e.scope.getOptions(),
          i = a.transform(t, [
            a.removeStyles,
            a.customFormatterFactory(h.format, !1, r),
            a.concatFirstStringElements,
            a.toStringFactory(h.depth),
          ]);
        n.writeLine(i);
      }
      function d(t, n) {
        var r = ["electron-log.transports.file: " + t];
        n && r.push(n),
          e.transports.console({ data: r, date: new Date(), level: "warn" });
      }
      function p(e) {
        var t = Object.assign({}, n, { fileName: h.fileName }),
          r = h.resolvePath(t, e);
        return u.provide(r, h.writeOptions, !h.sync);
      }
    };
    var l = new u();
  },
  "./node_modules/electron-log/src/transports/file/packageJson.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("fs"),
      i = n("path");
    function s(e) {
      try {
        var t = o("package.json", (e = i.join.apply(i, arguments)));
        if (!t) return null;
        var n = JSON.parse(r.readFileSync(t, "utf8")),
          s = n.productName || n.name;
        if (!s || "electron" === s.toLowerCase()) return null;
        if (n.productName || n.name) return { name: s, version: n.version };
      } catch (e) {
        return null;
      }
    }
    function o(e, t) {
      for (var n = t; ; ) {
        var s = i.parse(n),
          o = s.root,
          a = s.dir;
        if (r.existsSync(i.join(n, e))) return i.resolve(i.join(n, e));
        if (n === o) return null;
        n = a;
      }
    }
    e.exports = {
      readPackageJson: function () {
        return (
          s(n.c[n.s] && n.c[n.s].filename) ||
          s(process.resourcesPath, "app.asar") ||
          s(process.resourcesPath, "app") ||
          s(process.cwd()) || { name: null, version: null }
        );
      },
      tryReadJsonAt: s,
    };
  },
  "./node_modules/electron-log/src/transports/file/variables.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("os"),
      i = n("path"),
      s = n("./node_modules/electron-log/src/electronApi.js"),
      o = n("./node_modules/electron-log/src/transports/file/packageJson.js");
    function a(e) {
      var t = s.getPath("appData");
      if (t) return t;
      var n = u();
      switch (e) {
        case "darwin":
          return i.join(n, "Library/Application Support");
        case "win32":
          return process.env.APPDATA || i.join(n, "AppData/Roaming");
        default:
          return process.env.XDG_CONFIG_HOME || i.join(n, ".config");
      }
    }
    function u() {
      return r.homedir ? r.homedir() : process.env.HOME;
    }
    function c(e, t) {
      return "darwin" === e
        ? i.join(u(), "Library/Logs", t)
        : i.join(d(e, t), "logs");
    }
    function l(e) {
      return "darwin" === e
        ? i.join(u(), "Library/Logs", "{appName}")
        : i.join(a(e), "{appName}", "logs");
    }
    function h() {
      var e = s.getName() || "",
        t = s.getVersion();
      if (("electron" === e.toLowerCase() && ((e = ""), (t = "")), e && t))
        return { name: e, version: t };
      var n = o.readPackageJson();
      return e || (e = n.name), t || (t = n.version), { name: e, version: t };
    }
    function d(e, t) {
      return s.getName() !== t
        ? i.join(a(e), t)
        : s.getPath("userData") || i.join(a(e), t);
    }
    e.exports = {
      getAppData: a,
      getLibraryDefaultDir: c,
      getLibraryTemplate: l,
      getNameAndVersion: h,
      getPathVariables: function (e) {
        var t = h(),
          n = t.name,
          i = t.version;
        return {
          appData: a(e),
          appName: n,
          appVersion: i,
          electronDefaultDir: s.getPath("logs"),
          home: u(),
          libraryDefaultDir: c(e, n),
          libraryTemplate: l(e),
          temp: s.getPath("temp") || r.tmpdir(),
          userData: d(e, n),
        };
      },
      getUserData: d,
    };
  },
  "./node_modules/electron-log/src/transports/ipc.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/electron-log/src/transform/index.js"),
      i = n("./node_modules/electron-log/src/electronApi.js"),
      s = n("./node_modules/electron-log/src/log.js");
    e.exports = function (e) {
      if (
        ((t.eventId = "__ELECTRON_LOG_IPC_" + e.logId + "__"),
        (t.level = !!e.isDev && "silly"),
        i.isIpcChannelListened(t.eventId))
      )
        return function () {};
      return (
        i.onIpc(t.eventId, function (t, n) {
          (n.date = new Date(n.date)),
            s.runTransport(e.transports.console, n, e);
        }),
        i.loadRemoteModule("electron-log"),
        i.isElectron() ? t : null
      );
      function t(e) {
        var n = Object.assign({}, e, {
          data: r.transform(e, [r.toJSON, r.maxDepthFactory(3)]),
        });
        i.sendIpc(t.eventId, n);
      }
    };
  },
  "./node_modules/electron-log/src/transports/remote.js": function (e, t, n) {
    "use strict";
    var r = n("http"),
      i = n("https"),
      s = n("url"),
      o = n("./node_modules/electron-log/src/log.js"),
      a = n("./node_modules/electron-log/src/transform/index.js");
    e.exports = function (e) {
      return (
        (t.client = { name: "electron-application" }),
        (t.depth = 6),
        (t.level = !1),
        (t.requestOptions = {}),
        (t.url = null),
        (t.onError = null),
        (t.transformBody = function (e) {
          return JSON.stringify(e);
        }),
        t
      );
      function t(n) {
        if (t.url) {
          var u = t.transformBody({
            client: t.client,
            data: a.transform(n, [
              a.removeStyles,
              a.toJSON,
              a.maxDepthFactory(t.depth + 1),
            ]),
            date: n.date.getTime(),
            level: n.level,
            variables: n.variables,
          });
          (function (e, t, n) {
            var o = s.parse(e),
              a = "https:" === o.protocol ? i : r,
              u = {
                hostname: o.hostname,
                port: o.port,
                path: o.path,
                method: "POST",
                headers: {
                  "Content-Length": n.length,
                  "Content-Type": "application/json",
                },
              };
            Object.assign(u, t);
            var c = a.request(u);
            return c.write(n), c.end(), c;
          })(t.url, t.requestOptions, u).on(
            "error",
            t.onError ||
              function (n) {
                var r = {
                    data: [
                      "electron-log.transports.remote: cannot send HTTP request to " +
                        t.url,
                      n,
                    ],
                    date: new Date(),
                    level: "warn",
                  },
                  i = [
                    e.transports.console,
                    e.transports.ipc,
                    e.transports.file,
                  ];
                o.runTransports(i, r, e);
              }
          );
        }
      }
    };
  },
  "./node_modules/electron-updater/node_modules/semver/classes/comparator.js": function (
    e,
    t,
    n
  ) {
    const r = Symbol("SemVer ANY");
    class i {
      static get ANY() {
        return r;
      }
      constructor(e, t) {
        if (
          ((t && "object" == typeof t) ||
            (t = { loose: !!t, includePrerelease: !1 }),
          e instanceof i)
        ) {
          if (e.loose === !!t.loose) return e;
          e = e.value;
        }
        u("comparator", e, t),
          (this.options = t),
          (this.loose = !!t.loose),
          this.parse(e),
          this.semver === r
            ? (this.value = "")
            : (this.value = this.operator + this.semver.version),
          u("comp", this);
      }
      parse(e) {
        const t = this.options.loose ? s[o.COMPARATORLOOSE] : s[o.COMPARATOR],
          n = e.match(t);
        if (!n) throw new TypeError("Invalid comparator: " + e);
        (this.operator = void 0 !== n[1] ? n[1] : ""),
          "=" === this.operator && (this.operator = ""),
          n[2]
            ? (this.semver = new c(n[2], this.options.loose))
            : (this.semver = r);
      }
      toString() {
        return this.value;
      }
      test(e) {
        if (
          (u("Comparator.test", e, this.options.loose),
          this.semver === r || e === r)
        )
          return !0;
        if ("string" == typeof e)
          try {
            e = new c(e, this.options);
          } catch (e) {
            return !1;
          }
        return a(e, this.operator, this.semver, this.options);
      }
      intersects(e, t) {
        if (!(e instanceof i)) throw new TypeError("a Comparator is required");
        if (
          ((t && "object" == typeof t) ||
            (t = { loose: !!t, includePrerelease: !1 }),
          "" === this.operator)
        )
          return "" === this.value || new l(e.value, t).test(this.value);
        if ("" === e.operator)
          return "" === e.value || new l(this.value, t).test(e.semver);
        const n = !(
            (">=" !== this.operator && ">" !== this.operator) ||
            (">=" !== e.operator && ">" !== e.operator)
          ),
          r = !(
            ("<=" !== this.operator && "<" !== this.operator) ||
            ("<=" !== e.operator && "<" !== e.operator)
          ),
          s = this.semver.version === e.semver.version,
          o = !(
            (">=" !== this.operator && "<=" !== this.operator) ||
            (">=" !== e.operator && "<=" !== e.operator)
          ),
          u =
            a(this.semver, "<", e.semver, t) &&
            (">=" === this.operator || ">" === this.operator) &&
            ("<=" === e.operator || "<" === e.operator),
          c =
            a(this.semver, ">", e.semver, t) &&
            ("<=" === this.operator || "<" === this.operator) &&
            (">=" === e.operator || ">" === e.operator);
        return n || r || (s && o) || u || c;
      }
    }
    e.exports = i;
    const { re: s, t: o } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/re.js"
      ),
      a = n(
        "./node_modules/electron-updater/node_modules/semver/functions/cmp.js"
      ),
      u = n(
        "./node_modules/electron-updater/node_modules/semver/internal/debug.js"
      ),
      c = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      l = n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      );
  },
  "./node_modules/electron-updater/node_modules/semver/classes/range.js": function (
    e,
    t,
    n
  ) {
    class r {
      constructor(e, t) {
        if (
          ((t && "object" == typeof t) ||
            (t = { loose: !!t, includePrerelease: !1 }),
          e instanceof r)
        )
          return e.loose === !!t.loose &&
            e.includePrerelease === !!t.includePrerelease
            ? e
            : new r(e.raw, t);
        if (e instanceof i)
          return (this.raw = e.value), (this.set = [[e]]), this.format(), this;
        if (
          ((this.options = t),
          (this.loose = !!t.loose),
          (this.includePrerelease = !!t.includePrerelease),
          (this.raw = e),
          (this.set = e
            .split(/\s*\|\|\s*/)
            .map((e) => this.parseRange(e.trim()))
            .filter((e) => e.length)),
          !this.set.length)
        )
          throw new TypeError("Invalid SemVer Range: " + e);
        this.format();
      }
      format() {
        return (
          (this.range = this.set
            .map((e) => e.join(" ").trim())
            .join("||")
            .trim()),
          this.range
        );
      }
      toString() {
        return this.range;
      }
      parseRange(e) {
        const t = this.options.loose;
        e = e.trim();
        const n = t ? a[u.HYPHENRANGELOOSE] : a[u.HYPHENRANGE];
        (e = e.replace(n, w(this.options.includePrerelease))),
          s("hyphen replace", e),
          (e = e.replace(a[u.COMPARATORTRIM], c)),
          s("comparator trim", e, a[u.COMPARATORTRIM]),
          (e = (e = (e = e.replace(a[u.TILDETRIM], l)).replace(
            a[u.CARETTRIM],
            h
          ))
            .split(/\s+/)
            .join(" "));
        const r = t ? a[u.COMPARATORLOOSE] : a[u.COMPARATOR];
        return e
          .split(" ")
          .map((e) => p(e, this.options))
          .join(" ")
          .split(/\s+/)
          .map((e) => D(e, this.options))
          .filter(this.options.loose ? (e) => !!e.match(r) : () => !0)
          .map((e) => new i(e, this.options));
      }
      intersects(e, t) {
        if (!(e instanceof r)) throw new TypeError("a Range is required");
        return this.set.some(
          (n) =>
            d(n, t) &&
            e.set.some(
              (e) =>
                d(e, t) && n.every((n) => e.every((e) => n.intersects(e, t)))
            )
        );
      }
      test(e) {
        if (!e) return !1;
        if ("string" == typeof e)
          try {
            e = new o(e, this.options);
          } catch (e) {
            return !1;
          }
        for (let t = 0; t < this.set.length; t++)
          if (_(this.set[t], e, this.options)) return !0;
        return !1;
      }
    }
    e.exports = r;
    const i = n(
        "./node_modules/electron-updater/node_modules/semver/classes/comparator.js"
      ),
      s = n(
        "./node_modules/electron-updater/node_modules/semver/internal/debug.js"
      ),
      o = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      {
        re: a,
        t: u,
        comparatorTrimReplace: c,
        tildeTrimReplace: l,
        caretTrimReplace: h,
      } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/re.js"
      ),
      d = (e, t) => {
        let n = !0;
        const r = e.slice();
        let i = r.pop();
        for (; n && r.length; )
          (n = r.every((e) => i.intersects(e, t))), (i = r.pop());
        return n;
      },
      p = (e, t) => (
        s("comp", e, t),
        (e = y(e, t)),
        s("caret", e),
        (e = m(e, t)),
        s("tildes", e),
        (e = E(e, t)),
        s("xrange", e),
        (e = b(e, t)),
        s("stars", e),
        e
      ),
      f = (e) => !e || "x" === e.toLowerCase() || "*" === e,
      m = (e, t) =>
        e
          .trim()
          .split(/\s+/)
          .map((e) => g(e, t))
          .join(" "),
      g = (e, t) => {
        const n = t.loose ? a[u.TILDELOOSE] : a[u.TILDE];
        return e.replace(n, (t, n, r, i, o) => {
          let a;
          return (
            s("tilde", e, t, n, r, i, o),
            f(n)
              ? (a = "")
              : f(r)
              ? (a = `>=${n}.0.0 <${+n + 1}.0.0-0`)
              : f(i)
              ? (a = `>=${n}.${r}.0 <${n}.${+r + 1}.0-0`)
              : o
              ? (s("replaceTilde pr", o),
                (a = `>=${n}.${r}.${i}-${o} <${n}.${+r + 1}.0-0`))
              : (a = `>=${n}.${r}.${i} <${n}.${+r + 1}.0-0`),
            s("tilde return", a),
            a
          );
        });
      },
      y = (e, t) =>
        e
          .trim()
          .split(/\s+/)
          .map((e) => v(e, t))
          .join(" "),
      v = (e, t) => {
        s("caret", e, t);
        const n = t.loose ? a[u.CARETLOOSE] : a[u.CARET],
          r = t.includePrerelease ? "-0" : "";
        return e.replace(n, (t, n, i, o, a) => {
          let u;
          return (
            s("caret", e, t, n, i, o, a),
            f(n)
              ? (u = "")
              : f(i)
              ? (u = `>=${n}.0.0${r} <${+n + 1}.0.0-0`)
              : f(o)
              ? (u =
                  "0" === n
                    ? `>=${n}.${i}.0${r} <${n}.${+i + 1}.0-0`
                    : `>=${n}.${i}.0${r} <${+n + 1}.0.0-0`)
              : a
              ? (s("replaceCaret pr", a),
                (u =
                  "0" === n
                    ? "0" === i
                      ? `>=${n}.${i}.${o}-${a} <${n}.${i}.${+o + 1}-0`
                      : `>=${n}.${i}.${o}-${a} <${n}.${+i + 1}.0-0`
                    : `>=${n}.${i}.${o}-${a} <${+n + 1}.0.0-0`))
              : (s("no pr"),
                (u =
                  "0" === n
                    ? "0" === i
                      ? `>=${n}.${i}.${o}${r} <${n}.${i}.${+o + 1}-0`
                      : `>=${n}.${i}.${o}${r} <${n}.${+i + 1}.0-0`
                    : `>=${n}.${i}.${o} <${+n + 1}.0.0-0`)),
            s("caret return", u),
            u
          );
        });
      },
      E = (e, t) => (
        s("replaceXRanges", e, t),
        e
          .split(/\s+/)
          .map((e) => x(e, t))
          .join(" ")
      ),
      x = (e, t) => {
        e = e.trim();
        const n = t.loose ? a[u.XRANGELOOSE] : a[u.XRANGE];
        return e.replace(n, (n, r, i, o, a, u) => {
          s("xRange", e, n, r, i, o, a, u);
          const c = f(i),
            l = c || f(o),
            h = l || f(a),
            d = h;
          return (
            "=" === r && d && (r = ""),
            (u = t.includePrerelease ? "-0" : ""),
            c
              ? (n = ">" === r || "<" === r ? "<0.0.0-0" : "*")
              : r && d
              ? (l && (o = 0),
                (a = 0),
                ">" === r
                  ? ((r = ">="),
                    l
                      ? ((i = +i + 1), (o = 0), (a = 0))
                      : ((o = +o + 1), (a = 0)))
                  : "<=" === r && ((r = "<"), l ? (i = +i + 1) : (o = +o + 1)),
                "<" === r && (u = "-0"),
                (n = `${r + i}.${o}.${a}${u}`))
              : l
              ? (n = `>=${i}.0.0${u} <${+i + 1}.0.0-0`)
              : h && (n = `>=${i}.${o}.0${u} <${i}.${+o + 1}.0-0`),
            s("xRange return", n),
            n
          );
        });
      },
      b = (e, t) => (s("replaceStars", e, t), e.trim().replace(a[u.STAR], "")),
      D = (e, t) => (
        s("replaceGTE0", e, t),
        e.trim().replace(a[t.includePrerelease ? u.GTE0PRE : u.GTE0], "")
      ),
      w = (e) => (t, n, r, i, s, o, a, u, c, l, h, d, p) =>
        `${(n = f(r)
          ? ""
          : f(i)
          ? `>=${r}.0.0${e ? "-0" : ""}`
          : f(s)
          ? `>=${r}.${i}.0${e ? "-0" : ""}`
          : o
          ? ">=" + n
          : `>=${n}${e ? "-0" : ""}`)} ${(u = f(c)
          ? ""
          : f(l)
          ? `<${+c + 1}.0.0-0`
          : f(h)
          ? `<${c}.${+l + 1}.0-0`
          : d
          ? `<=${c}.${l}.${h}-${d}`
          : e
          ? `<${c}.${l}.${+h + 1}-0`
          : "<=" + u)}`.trim(),
      _ = (e, t, n) => {
        for (let n = 0; n < e.length; n++) if (!e[n].test(t)) return !1;
        if (t.prerelease.length && !n.includePrerelease) {
          for (let n = 0; n < e.length; n++)
            if (
              (s(e[n].semver),
              e[n].semver !== i.ANY && e[n].semver.prerelease.length > 0)
            ) {
              const r = e[n].semver;
              if (
                r.major === t.major &&
                r.minor === t.minor &&
                r.patch === t.patch
              )
                return !0;
            }
          return !1;
        }
        return !0;
      };
  },
  "./node_modules/electron-updater/node_modules/semver/classes/semver.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/internal/debug.js"
      ),
      { MAX_LENGTH: i, MAX_SAFE_INTEGER: s } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/constants.js"
      ),
      { re: o, t: a } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/re.js"
      ),
      { compareIdentifiers: u } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/identifiers.js"
      );
    class c {
      constructor(e, t) {
        if (
          ((t && "object" == typeof t) ||
            (t = { loose: !!t, includePrerelease: !1 }),
          e instanceof c)
        ) {
          if (
            e.loose === !!t.loose &&
            e.includePrerelease === !!t.includePrerelease
          )
            return e;
          e = e.version;
        } else if ("string" != typeof e)
          throw new TypeError("Invalid Version: " + e);
        if (e.length > i)
          throw new TypeError(`version is longer than ${i} characters`);
        r("SemVer", e, t),
          (this.options = t),
          (this.loose = !!t.loose),
          (this.includePrerelease = !!t.includePrerelease);
        const n = e.trim().match(t.loose ? o[a.LOOSE] : o[a.FULL]);
        if (!n) throw new TypeError("Invalid Version: " + e);
        if (
          ((this.raw = e),
          (this.major = +n[1]),
          (this.minor = +n[2]),
          (this.patch = +n[3]),
          this.major > s || this.major < 0)
        )
          throw new TypeError("Invalid major version");
        if (this.minor > s || this.minor < 0)
          throw new TypeError("Invalid minor version");
        if (this.patch > s || this.patch < 0)
          throw new TypeError("Invalid patch version");
        n[4]
          ? (this.prerelease = n[4].split(".").map((e) => {
              if (/^[0-9]+$/.test(e)) {
                const t = +e;
                if (t >= 0 && t < s) return t;
              }
              return e;
            }))
          : (this.prerelease = []),
          (this.build = n[5] ? n[5].split(".") : []),
          this.format();
      }
      format() {
        return (
          (this.version = `${this.major}.${this.minor}.${this.patch}`),
          this.prerelease.length &&
            (this.version += "-" + this.prerelease.join(".")),
          this.version
        );
      }
      toString() {
        return this.version;
      }
      compare(e) {
        if (
          (r("SemVer.compare", this.version, this.options, e),
          !(e instanceof c))
        ) {
          if ("string" == typeof e && e === this.version) return 0;
          e = new c(e, this.options);
        }
        return e.version === this.version
          ? 0
          : this.compareMain(e) || this.comparePre(e);
      }
      compareMain(e) {
        return (
          e instanceof c || (e = new c(e, this.options)),
          u(this.major, e.major) ||
            u(this.minor, e.minor) ||
            u(this.patch, e.patch)
        );
      }
      comparePre(e) {
        if (
          (e instanceof c || (e = new c(e, this.options)),
          this.prerelease.length && !e.prerelease.length)
        )
          return -1;
        if (!this.prerelease.length && e.prerelease.length) return 1;
        if (!this.prerelease.length && !e.prerelease.length) return 0;
        let t = 0;
        do {
          const n = this.prerelease[t],
            i = e.prerelease[t];
          if ((r("prerelease compare", t, n, i), void 0 === n && void 0 === i))
            return 0;
          if (void 0 === i) return 1;
          if (void 0 === n) return -1;
          if (n !== i) return u(n, i);
        } while (++t);
      }
      compareBuild(e) {
        e instanceof c || (e = new c(e, this.options));
        let t = 0;
        do {
          const n = this.build[t],
            i = e.build[t];
          if ((r("prerelease compare", t, n, i), void 0 === n && void 0 === i))
            return 0;
          if (void 0 === i) return 1;
          if (void 0 === n) return -1;
          if (n !== i) return u(n, i);
        } while (++t);
      }
      inc(e, t) {
        switch (e) {
          case "premajor":
            (this.prerelease.length = 0),
              (this.patch = 0),
              (this.minor = 0),
              this.major++,
              this.inc("pre", t);
            break;
          case "preminor":
            (this.prerelease.length = 0),
              (this.patch = 0),
              this.minor++,
              this.inc("pre", t);
            break;
          case "prepatch":
            (this.prerelease.length = 0),
              this.inc("patch", t),
              this.inc("pre", t);
            break;
          case "prerelease":
            0 === this.prerelease.length && this.inc("patch", t),
              this.inc("pre", t);
            break;
          case "major":
            (0 === this.minor &&
              0 === this.patch &&
              0 !== this.prerelease.length) ||
              this.major++,
              (this.minor = 0),
              (this.patch = 0),
              (this.prerelease = []);
            break;
          case "minor":
            (0 === this.patch && 0 !== this.prerelease.length) || this.minor++,
              (this.patch = 0),
              (this.prerelease = []);
            break;
          case "patch":
            0 === this.prerelease.length && this.patch++,
              (this.prerelease = []);
            break;
          case "pre":
            if (0 === this.prerelease.length) this.prerelease = [0];
            else {
              let e = this.prerelease.length;
              for (; --e >= 0; )
                "number" == typeof this.prerelease[e] &&
                  (this.prerelease[e]++, (e = -2));
              -1 === e && this.prerelease.push(0);
            }
            t &&
              (this.prerelease[0] === t
                ? isNaN(this.prerelease[1]) && (this.prerelease = [t, 0])
                : (this.prerelease = [t, 0]));
            break;
          default:
            throw new Error("invalid increment argument: " + e);
        }
        return this.format(), (this.raw = this.version), this;
      }
    }
    e.exports = c;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/clean.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/parse.js"
    );
    e.exports = (e, t) => {
      const n = r(e.trim().replace(/^[=v]+/, ""), t);
      return n ? n.version : null;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/cmp.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/functions/eq.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/functions/neq.js"
      ),
      s = n(
        "./node_modules/electron-updater/node_modules/semver/functions/gt.js"
      ),
      o = n(
        "./node_modules/electron-updater/node_modules/semver/functions/gte.js"
      ),
      a = n(
        "./node_modules/electron-updater/node_modules/semver/functions/lt.js"
      ),
      u = n(
        "./node_modules/electron-updater/node_modules/semver/functions/lte.js"
      );
    e.exports = (e, t, n, c) => {
      switch (t) {
        case "===":
          return (
            "object" == typeof e && (e = e.version),
            "object" == typeof n && (n = n.version),
            e === n
          );
        case "!==":
          return (
            "object" == typeof e && (e = e.version),
            "object" == typeof n && (n = n.version),
            e !== n
          );
        case "":
        case "=":
        case "==":
          return r(e, n, c);
        case "!=":
          return i(e, n, c);
        case ">":
          return s(e, n, c);
        case ">=":
          return o(e, n, c);
        case "<":
          return a(e, n, c);
        case "<=":
          return u(e, n, c);
        default:
          throw new TypeError("Invalid operator: " + t);
      }
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/coerce.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/functions/parse.js"
      ),
      { re: s, t: o } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/re.js"
      );
    e.exports = (e, t) => {
      if (e instanceof r) return e;
      if (("number" == typeof e && (e = String(e)), "string" != typeof e))
        return null;
      let n = null;
      if ((t = t || {}).rtl) {
        let t;
        for (
          ;
          (t = s[o.COERCERTL].exec(e)) &&
          (!n || n.index + n[0].length !== e.length);

        )
          (n && t.index + t[0].length === n.index + n[0].length) || (n = t),
            (s[o.COERCERTL].lastIndex = t.index + t[1].length + t[2].length);
        s[o.COERCERTL].lastIndex = -1;
      } else n = e.match(s[o.COERCE]);
      return null === n ? null : i(`${n[2]}.${n[3] || "0"}.${n[4] || "0"}`, t);
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/compare-build.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
    );
    e.exports = (e, t, n) => {
      const i = new r(e, n),
        s = new r(t, n);
      return i.compare(s) || i.compareBuild(s);
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/compare-loose.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t) => r(e, t, !0);
  },
  "./node_modules/electron-updater/node_modules/semver/functions/compare.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
    );
    e.exports = (e, t, n) => new r(e, n).compare(new r(t, n));
  },
  "./node_modules/electron-updater/node_modules/semver/functions/diff.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/functions/parse.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/functions/eq.js"
      );
    e.exports = (e, t) => {
      if (i(e, t)) return null;
      {
        const n = r(e),
          i = r(t),
          s = n.prerelease.length || i.prerelease.length,
          o = s ? "pre" : "",
          a = s ? "prerelease" : "";
        for (const e in n)
          if (
            ("major" === e || "minor" === e || "patch" === e) &&
            n[e] !== i[e]
          )
            return o + e;
        return a;
      }
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/eq.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => 0 === r(e, t, n);
  },
  "./node_modules/electron-updater/node_modules/semver/functions/gt.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => r(e, t, n) > 0;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/gte.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => r(e, t, n) >= 0;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/inc.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
    );
    e.exports = (e, t, n, i) => {
      "string" == typeof n && ((i = n), (n = void 0));
      try {
        return new r(e, n).inc(t, i).version;
      } catch (e) {
        return null;
      }
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/lt.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => r(e, t, n) < 0;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/lte.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => r(e, t, n) <= 0;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/major.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
    );
    e.exports = (e, t) => new r(e, t).major;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/minor.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
    );
    e.exports = (e, t) => new r(e, t).minor;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/neq.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => 0 !== r(e, t, n);
  },
  "./node_modules/electron-updater/node_modules/semver/functions/parse.js": function (
    e,
    t,
    n
  ) {
    const { MAX_LENGTH: r } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/constants.js"
      ),
      { re: i, t: s } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/re.js"
      ),
      o = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      );
    e.exports = (e, t) => {
      if (
        ((t && "object" == typeof t) ||
          (t = { loose: !!t, includePrerelease: !1 }),
        e instanceof o)
      )
        return e;
      if ("string" != typeof e) return null;
      if (e.length > r) return null;
      if (!(t.loose ? i[s.LOOSE] : i[s.FULL]).test(e)) return null;
      try {
        return new o(e, t);
      } catch (e) {
        return null;
      }
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/patch.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
    );
    e.exports = (e, t) => new r(e, t).patch;
  },
  "./node_modules/electron-updater/node_modules/semver/functions/prerelease.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/parse.js"
    );
    e.exports = (e, t) => {
      const n = r(e, t);
      return n && n.prerelease.length ? n.prerelease : null;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/rcompare.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
    );
    e.exports = (e, t, n) => r(t, e, n);
  },
  "./node_modules/electron-updater/node_modules/semver/functions/rsort.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare-build.js"
    );
    e.exports = (e, t) => e.sort((e, n) => r(n, e, t));
  },
  "./node_modules/electron-updater/node_modules/semver/functions/satisfies.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/range.js"
    );
    e.exports = (e, t, n) => {
      try {
        t = new r(t, n);
      } catch (e) {
        return !1;
      }
      return t.test(e);
    };
  },
  "./node_modules/electron-updater/node_modules/semver/functions/sort.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/compare-build.js"
    );
    e.exports = (e, t) => e.sort((e, n) => r(e, n, t));
  },
  "./node_modules/electron-updater/node_modules/semver/functions/valid.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/functions/parse.js"
    );
    e.exports = (e, t) => {
      const n = r(e, t);
      return n ? n.version : null;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/index.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/internal/re.js"
    );
    e.exports = {
      re: r.re,
      src: r.src,
      tokens: r.t,
      SEMVER_SPEC_VERSION: n(
        "./node_modules/electron-updater/node_modules/semver/internal/constants.js"
      ).SEMVER_SPEC_VERSION,
      SemVer: n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      compareIdentifiers: n(
        "./node_modules/electron-updater/node_modules/semver/internal/identifiers.js"
      ).compareIdentifiers,
      rcompareIdentifiers: n(
        "./node_modules/electron-updater/node_modules/semver/internal/identifiers.js"
      ).rcompareIdentifiers,
      parse: n(
        "./node_modules/electron-updater/node_modules/semver/functions/parse.js"
      ),
      valid: n(
        "./node_modules/electron-updater/node_modules/semver/functions/valid.js"
      ),
      clean: n(
        "./node_modules/electron-updater/node_modules/semver/functions/clean.js"
      ),
      inc: n(
        "./node_modules/electron-updater/node_modules/semver/functions/inc.js"
      ),
      diff: n(
        "./node_modules/electron-updater/node_modules/semver/functions/diff.js"
      ),
      major: n(
        "./node_modules/electron-updater/node_modules/semver/functions/major.js"
      ),
      minor: n(
        "./node_modules/electron-updater/node_modules/semver/functions/minor.js"
      ),
      patch: n(
        "./node_modules/electron-updater/node_modules/semver/functions/patch.js"
      ),
      prerelease: n(
        "./node_modules/electron-updater/node_modules/semver/functions/prerelease.js"
      ),
      compare: n(
        "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
      ),
      rcompare: n(
        "./node_modules/electron-updater/node_modules/semver/functions/rcompare.js"
      ),
      compareLoose: n(
        "./node_modules/electron-updater/node_modules/semver/functions/compare-loose.js"
      ),
      compareBuild: n(
        "./node_modules/electron-updater/node_modules/semver/functions/compare-build.js"
      ),
      sort: n(
        "./node_modules/electron-updater/node_modules/semver/functions/sort.js"
      ),
      rsort: n(
        "./node_modules/electron-updater/node_modules/semver/functions/rsort.js"
      ),
      gt: n(
        "./node_modules/electron-updater/node_modules/semver/functions/gt.js"
      ),
      lt: n(
        "./node_modules/electron-updater/node_modules/semver/functions/lt.js"
      ),
      eq: n(
        "./node_modules/electron-updater/node_modules/semver/functions/eq.js"
      ),
      neq: n(
        "./node_modules/electron-updater/node_modules/semver/functions/neq.js"
      ),
      gte: n(
        "./node_modules/electron-updater/node_modules/semver/functions/gte.js"
      ),
      lte: n(
        "./node_modules/electron-updater/node_modules/semver/functions/lte.js"
      ),
      cmp: n(
        "./node_modules/electron-updater/node_modules/semver/functions/cmp.js"
      ),
      coerce: n(
        "./node_modules/electron-updater/node_modules/semver/functions/coerce.js"
      ),
      Comparator: n(
        "./node_modules/electron-updater/node_modules/semver/classes/comparator.js"
      ),
      Range: n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      ),
      satisfies: n(
        "./node_modules/electron-updater/node_modules/semver/functions/satisfies.js"
      ),
      toComparators: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/to-comparators.js"
      ),
      maxSatisfying: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/max-satisfying.js"
      ),
      minSatisfying: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/min-satisfying.js"
      ),
      minVersion: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/min-version.js"
      ),
      validRange: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/valid.js"
      ),
      outside: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/outside.js"
      ),
      gtr: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/gtr.js"
      ),
      ltr: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/ltr.js"
      ),
      intersects: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/intersects.js"
      ),
      simplifyRange: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/simplify.js"
      ),
      subset: n(
        "./node_modules/electron-updater/node_modules/semver/ranges/subset.js"
      ),
    };
  },
  "./node_modules/electron-updater/node_modules/semver/internal/constants.js": function (
    e,
    t
  ) {
    const n = Number.MAX_SAFE_INTEGER || 9007199254740991;
    e.exports = {
      SEMVER_SPEC_VERSION: "2.0.0",
      MAX_LENGTH: 256,
      MAX_SAFE_INTEGER: n,
      MAX_SAFE_COMPONENT_LENGTH: 16,
    };
  },
  "./node_modules/electron-updater/node_modules/semver/internal/debug.js": function (
    e,
    t
  ) {
    const n =
      "object" == typeof process &&
      process.env &&
      process.env.NODE_DEBUG &&
      /\bsemver\b/i.test(process.env.NODE_DEBUG)
        ? (...e) => console.error("SEMVER", ...e)
        : () => {};
    e.exports = n;
  },
  "./node_modules/electron-updater/node_modules/semver/internal/identifiers.js": function (
    e,
    t
  ) {
    const n = /^[0-9]+$/,
      r = (e, t) => {
        const r = n.test(e),
          i = n.test(t);
        return (
          r && i && ((e = +e), (t = +t)),
          e === t ? 0 : r && !i ? -1 : i && !r ? 1 : e < t ? -1 : 1
        );
      };
    e.exports = {
      compareIdentifiers: r,
      rcompareIdentifiers: (e, t) => r(t, e),
    };
  },
  "./node_modules/electron-updater/node_modules/semver/internal/re.js": function (
    e,
    t,
    n
  ) {
    const { MAX_SAFE_COMPONENT_LENGTH: r } = n(
        "./node_modules/electron-updater/node_modules/semver/internal/constants.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/internal/debug.js"
      ),
      s = ((t = e.exports = {}).re = []),
      o = (t.src = []),
      a = (t.t = {});
    let u = 0;
    const c = (e, t, n) => {
      const r = u++;
      i(r, t), (a[e] = r), (o[r] = t), (s[r] = new RegExp(t, n ? "g" : void 0));
    };
    c("NUMERICIDENTIFIER", "0|[1-9]\\d*"),
      c("NUMERICIDENTIFIERLOOSE", "[0-9]+"),
      c("NONNUMERICIDENTIFIER", "\\d*[a-zA-Z-][a-zA-Z0-9-]*"),
      c(
        "MAINVERSION",
        `(${o[a.NUMERICIDENTIFIER]})\\.(${o[a.NUMERICIDENTIFIER]})\\.(${
          o[a.NUMERICIDENTIFIER]
        })`
      ),
      c(
        "MAINVERSIONLOOSE",
        `(${o[a.NUMERICIDENTIFIERLOOSE]})\\.(${
          o[a.NUMERICIDENTIFIERLOOSE]
        })\\.(${o[a.NUMERICIDENTIFIERLOOSE]})`
      ),
      c(
        "PRERELEASEIDENTIFIER",
        `(?:${o[a.NUMERICIDENTIFIER]}|${o[a.NONNUMERICIDENTIFIER]})`
      ),
      c(
        "PRERELEASEIDENTIFIERLOOSE",
        `(?:${o[a.NUMERICIDENTIFIERLOOSE]}|${o[a.NONNUMERICIDENTIFIER]})`
      ),
      c(
        "PRERELEASE",
        `(?:-(${o[a.PRERELEASEIDENTIFIER]}(?:\\.${
          o[a.PRERELEASEIDENTIFIER]
        })*))`
      ),
      c(
        "PRERELEASELOOSE",
        `(?:-?(${o[a.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${
          o[a.PRERELEASEIDENTIFIERLOOSE]
        })*))`
      ),
      c("BUILDIDENTIFIER", "[0-9A-Za-z-]+"),
      c(
        "BUILD",
        `(?:\\+(${o[a.BUILDIDENTIFIER]}(?:\\.${o[a.BUILDIDENTIFIER]})*))`
      ),
      c("FULLPLAIN", `v?${o[a.MAINVERSION]}${o[a.PRERELEASE]}?${o[a.BUILD]}?`),
      c("FULL", `^${o[a.FULLPLAIN]}$`),
      c(
        "LOOSEPLAIN",
        `[v=\\s]*${o[a.MAINVERSIONLOOSE]}${o[a.PRERELEASELOOSE]}?${o[a.BUILD]}?`
      ),
      c("LOOSE", `^${o[a.LOOSEPLAIN]}$`),
      c("GTLT", "((?:<|>)?=?)"),
      c("XRANGEIDENTIFIERLOOSE", o[a.NUMERICIDENTIFIERLOOSE] + "|x|X|\\*"),
      c("XRANGEIDENTIFIER", o[a.NUMERICIDENTIFIER] + "|x|X|\\*"),
      c(
        "XRANGEPLAIN",
        `[v=\\s]*(${o[a.XRANGEIDENTIFIER]})(?:\\.(${
          o[a.XRANGEIDENTIFIER]
        })(?:\\.(${o[a.XRANGEIDENTIFIER]})(?:${o[a.PRERELEASE]})?${
          o[a.BUILD]
        }?)?)?`
      ),
      c(
        "XRANGEPLAINLOOSE",
        `[v=\\s]*(${o[a.XRANGEIDENTIFIERLOOSE]})(?:\\.(${
          o[a.XRANGEIDENTIFIERLOOSE]
        })(?:\\.(${o[a.XRANGEIDENTIFIERLOOSE]})(?:${o[a.PRERELEASELOOSE]})?${
          o[a.BUILD]
        }?)?)?`
      ),
      c("XRANGE", `^${o[a.GTLT]}\\s*${o[a.XRANGEPLAIN]}$`),
      c("XRANGELOOSE", `^${o[a.GTLT]}\\s*${o[a.XRANGEPLAINLOOSE]}$`),
      c(
        "COERCE",
        `(^|[^\\d])(\\d{1,${r}})(?:\\.(\\d{1,${r}}))?(?:\\.(\\d{1,${r}}))?(?:$|[^\\d])`
      ),
      c("COERCERTL", o[a.COERCE], !0),
      c("LONETILDE", "(?:~>?)"),
      c("TILDETRIM", `(\\s*)${o[a.LONETILDE]}\\s+`, !0),
      (t.tildeTrimReplace = "$1~"),
      c("TILDE", `^${o[a.LONETILDE]}${o[a.XRANGEPLAIN]}$`),
      c("TILDELOOSE", `^${o[a.LONETILDE]}${o[a.XRANGEPLAINLOOSE]}$`),
      c("LONECARET", "(?:\\^)"),
      c("CARETTRIM", `(\\s*)${o[a.LONECARET]}\\s+`, !0),
      (t.caretTrimReplace = "$1^"),
      c("CARET", `^${o[a.LONECARET]}${o[a.XRANGEPLAIN]}$`),
      c("CARETLOOSE", `^${o[a.LONECARET]}${o[a.XRANGEPLAINLOOSE]}$`),
      c("COMPARATORLOOSE", `^${o[a.GTLT]}\\s*(${o[a.LOOSEPLAIN]})$|^$`),
      c("COMPARATOR", `^${o[a.GTLT]}\\s*(${o[a.FULLPLAIN]})$|^$`),
      c(
        "COMPARATORTRIM",
        `(\\s*)${o[a.GTLT]}\\s*(${o[a.LOOSEPLAIN]}|${o[a.XRANGEPLAIN]})`,
        !0
      ),
      (t.comparatorTrimReplace = "$1$2$3"),
      c(
        "HYPHENRANGE",
        `^\\s*(${o[a.XRANGEPLAIN]})\\s+-\\s+(${o[a.XRANGEPLAIN]})\\s*$`
      ),
      c(
        "HYPHENRANGELOOSE",
        `^\\s*(${o[a.XRANGEPLAINLOOSE]})\\s+-\\s+(${
          o[a.XRANGEPLAINLOOSE]
        })\\s*$`
      ),
      c("STAR", "(<|>)?=?\\s*\\*"),
      c("GTE0", "^\\s*>=\\s*0.0.0\\s*$"),
      c("GTE0PRE", "^\\s*>=\\s*0.0.0-0\\s*$");
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/gtr.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/ranges/outside.js"
    );
    e.exports = (e, t, n) => r(e, t, ">", n);
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/intersects.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/range.js"
    );
    e.exports = (e, t, n) => (
      (e = new r(e, n)), (t = new r(t, n)), e.intersects(t)
    );
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/ltr.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/ranges/outside.js"
    );
    e.exports = (e, t, n) => r(e, t, "<", n);
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/max-satisfying.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      );
    e.exports = (e, t, n) => {
      let s = null,
        o = null,
        a = null;
      try {
        a = new i(t, n);
      } catch (e) {
        return null;
      }
      return (
        e.forEach((e) => {
          a.test(e) &&
            ((s && -1 !== o.compare(e)) || ((s = e), (o = new r(s, n))));
        }),
        s
      );
    };
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/min-satisfying.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      );
    e.exports = (e, t, n) => {
      let s = null,
        o = null,
        a = null;
      try {
        a = new i(t, n);
      } catch (e) {
        return null;
      }
      return (
        e.forEach((e) => {
          a.test(e) &&
            ((s && 1 !== o.compare(e)) || ((s = e), (o = new r(s, n))));
        }),
        s
      );
    };
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/min-version.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      ),
      s = n(
        "./node_modules/electron-updater/node_modules/semver/functions/gt.js"
      );
    e.exports = (e, t) => {
      e = new i(e, t);
      let n = new r("0.0.0");
      if (e.test(n)) return n;
      if (((n = new r("0.0.0-0")), e.test(n))) return n;
      n = null;
      for (let t = 0; t < e.set.length; ++t) {
        e.set[t].forEach((e) => {
          const t = new r(e.semver.version);
          switch (e.operator) {
            case ">":
              0 === t.prerelease.length ? t.patch++ : t.prerelease.push(0),
                (t.raw = t.format());
            case "":
            case ">=":
              (n && !s(n, t)) || (n = t);
              break;
            case "<":
            case "<=":
              break;
            default:
              throw new Error("Unexpected operation: " + e.operator);
          }
        });
      }
      return n && e.test(n) ? n : null;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/outside.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/classes/semver.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/classes/comparator.js"
      ),
      { ANY: s } = i,
      o = n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      ),
      a = n(
        "./node_modules/electron-updater/node_modules/semver/functions/satisfies.js"
      ),
      u = n(
        "./node_modules/electron-updater/node_modules/semver/functions/gt.js"
      ),
      c = n(
        "./node_modules/electron-updater/node_modules/semver/functions/lt.js"
      ),
      l = n(
        "./node_modules/electron-updater/node_modules/semver/functions/lte.js"
      ),
      h = n(
        "./node_modules/electron-updater/node_modules/semver/functions/gte.js"
      );
    e.exports = (e, t, n, d) => {
      let p, f, m, g, y;
      switch (((e = new r(e, d)), (t = new o(t, d)), n)) {
        case ">":
          (p = u), (f = l), (m = c), (g = ">"), (y = ">=");
          break;
        case "<":
          (p = c), (f = h), (m = u), (g = "<"), (y = "<=");
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (a(e, t, d)) return !1;
      for (let n = 0; n < t.set.length; ++n) {
        const r = t.set[n];
        let o = null,
          a = null;
        if (
          (r.forEach((e) => {
            e.semver === s && (e = new i(">=0.0.0")),
              (o = o || e),
              (a = a || e),
              p(e.semver, o.semver, d)
                ? (o = e)
                : m(e.semver, a.semver, d) && (a = e);
          }),
          o.operator === g || o.operator === y)
        )
          return !1;
        if ((!a.operator || a.operator === g) && f(e, a.semver)) return !1;
        if (a.operator === y && m(e, a.semver)) return !1;
      }
      return !0;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/simplify.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/functions/satisfies.js"
      ),
      i = n(
        "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
      );
    e.exports = (e, t, n) => {
      const s = [];
      let o = null,
        a = null;
      const u = e.sort((e, t) => i(e, t, n));
      for (const e of u) {
        r(e, t, n)
          ? ((a = e), o || (o = e))
          : (a && s.push([o, a]), (a = null), (o = null));
      }
      o && s.push([o, null]);
      const c = [];
      for (const [e, t] of s)
        e === t
          ? c.push(e)
          : t || e !== u[0]
          ? t
            ? e === u[0]
              ? c.push("<=" + t)
              : c.push(`${e} - ${t}`)
            : c.push(">=" + e)
          : c.push("*");
      const l = c.join(" || "),
        h = "string" == typeof t.raw ? t.raw : String(t);
      return l.length < h.length ? l : t;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/subset.js": function (
    e,
    t,
    n
  ) {
    const r = n(
        "./node_modules/electron-updater/node_modules/semver/classes/range.js"
      ),
      { ANY: i } = n(
        "./node_modules/electron-updater/node_modules/semver/classes/comparator.js"
      ),
      s = n(
        "./node_modules/electron-updater/node_modules/semver/functions/satisfies.js"
      ),
      o = n(
        "./node_modules/electron-updater/node_modules/semver/functions/compare.js"
      ),
      a = (e, t, n) => {
        if (1 === e.length && e[0].semver === i)
          return 1 === t.length && t[0].semver === i;
        const r = new Set();
        let a, l, h, d, p, f, m;
        for (const t of e)
          ">" === t.operator || ">=" === t.operator
            ? (a = u(a, t, n))
            : "<" === t.operator || "<=" === t.operator
            ? (l = c(l, t, n))
            : r.add(t.semver);
        if (r.size > 1) return null;
        if (a && l) {
          if (((h = o(a.semver, l.semver, n)), h > 0)) return null;
          if (0 === h && (">=" !== a.operator || "<=" !== l.operator))
            return null;
        }
        for (const e of r) {
          if (a && !s(e, String(a), n)) return null;
          if (l && !s(e, String(l), n)) return null;
          for (const r of t) if (!s(e, String(r), n)) return !1;
          return !0;
        }
        for (const e of t) {
          if (
            ((m = m || ">" === e.operator || ">=" === e.operator),
            (f = f || "<" === e.operator || "<=" === e.operator),
            a)
          )
            if (">" === e.operator || ">=" === e.operator) {
              if (((d = u(a, e, n)), d === e)) return !1;
            } else if (">=" === a.operator && !s(a.semver, String(e), n))
              return !1;
          if (l)
            if ("<" === e.operator || "<=" === e.operator) {
              if (((p = c(l, e, n)), p === e)) return !1;
            } else if ("<=" === l.operator && !s(l.semver, String(e), n))
              return !1;
          if (!e.operator && (l || a) && 0 !== h) return !1;
        }
        return !(a && f && !l && 0 !== h) && !(l && m && !a && 0 !== h);
      },
      u = (e, t, n) => {
        if (!e) return t;
        const r = o(e.semver, t.semver, n);
        return r > 0
          ? e
          : r < 0 || (">" === t.operator && ">=" === e.operator)
          ? t
          : e;
      },
      c = (e, t, n) => {
        if (!e) return t;
        const r = o(e.semver, t.semver, n);
        return r < 0
          ? e
          : r > 0 || ("<" === t.operator && "<=" === e.operator)
          ? t
          : e;
      };
    e.exports = (e, t, n) => {
      (e = new r(e, n)), (t = new r(t, n));
      let i = !1;
      e: for (const r of e.set) {
        for (const e of t.set) {
          const t = a(r, e, n);
          if (((i = i || null !== t), t)) continue e;
        }
        if (i) return !1;
      }
      return !0;
    };
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/to-comparators.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/range.js"
    );
    e.exports = (e, t) =>
      new r(e, t).set.map((e) =>
        e
          .map((e) => e.value)
          .join(" ")
          .trim()
          .split(" ")
      );
  },
  "./node_modules/electron-updater/node_modules/semver/ranges/valid.js": function (
    e,
    t,
    n
  ) {
    const r = n(
      "./node_modules/electron-updater/node_modules/semver/classes/range.js"
    );
    e.exports = (e, t) => {
      try {
        return new r(e, t).range || "*";
      } catch (e) {
        return null;
      }
    };
  },
  "./node_modules/electron-updater/out/AppAdapter.js": function (e, t, n) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.getAppCacheDir = function () {
        const e = n("os").homedir();
        let t;
        t =
          "win32" === process.platform
            ? process.env.LOCALAPPDATA || r.join(e, "AppData", "Local")
            : "darwin" === process.platform
            ? r.join(e, "Library", "Application Support", "Caches")
            : process.env.XDG_CACHE_HOME || r.join(e, ".cache");
        return t;
      });
    var r = (function (e) {
      if (e && e.__esModule) return e;
      if (null === e || ("object" != typeof e && "function" != typeof e))
        return { default: e };
      var t = i();
      if (t && t.has(e)) return t.get(e);
      var n = {},
        r = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var s in e)
        if (Object.prototype.hasOwnProperty.call(e, s)) {
          var o = r ? Object.getOwnPropertyDescriptor(e, s) : null;
          o && (o.get || o.set)
            ? Object.defineProperty(n, s, o)
            : (n[s] = e[s]);
        }
      (n.default = e), t && t.set(e, n);
      return n;
    })(n("path"));
    function i() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
  },
  "./node_modules/electron-updater/out/AppImageUpdater.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("child_process");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.AppImageUpdater = void 0);
    var o = n("fs"),
      a = (function (e) {
        if (e && e.__esModule) return e;
        if (null === e || ("object" != typeof e && "function" != typeof e))
          return { default: e };
        var t = h();
        if (t && t.has(e)) return t.get(e);
        var n = {},
          r = Object.defineProperty && Object.getOwnPropertyDescriptor;
        for (var i in e)
          if (Object.prototype.hasOwnProperty.call(e, i)) {
            var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
            s && (s.get || s.set)
              ? Object.defineProperty(n, i, s)
              : (n[i] = e[i]);
          }
        (n.default = e), t && t.set(e, n);
        return n;
      })(n("path"));
    function u() {
      const e = n("./node_modules/electron-updater/out/BaseUpdater.js");
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    function c() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js"
      );
      return (
        (c = function () {
          return e;
        }),
        e
      );
    }
    function l() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (l = function () {
          return e;
        }),
        e
      );
    }
    function h() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (h = function () {
          return e;
        }),
        e
      );
    }
    class d extends u().BaseUpdater {
      constructor(e, t) {
        super(e, t);
      }
      isUpdaterActive() {
        return null == process.env.APPIMAGE
          ? (null == process.env.SNAP
              ? this._logger.warn(
                  "APPIMAGE env is not defined, current application is not an AppImage"
                )
              : this._logger.info("SNAP env is defined, updater is disabled"),
            !1)
          : super.isUpdaterActive();
      }
      doDownloadUpdate(e) {
        const t = e.updateInfoAndProvider.provider,
          n = (0, l().findFile)(
            t.resolveFiles(e.updateInfoAndProvider.info),
            "AppImage"
          );
        return this.executeDownload({
          fileExtension: "AppImage",
          fileInfo: n,
          downloadUpdateOptions: e,
          task: async (i, o) => {
            const a = process.env.APPIMAGE;
            if (null == a)
              throw (0, r().newError)(
                "APPIMAGE env is not defined",
                "ERR_UPDATER_OLD_FILE_NOT_FOUND"
              );
            let u = !1;
            try {
              await new (c().FileWithEmbeddedBlockMapDifferentialDownloader)(
                n.info,
                this.httpExecutor,
                {
                  newUrl: n.url,
                  oldFile: a,
                  logger: this._logger,
                  newFile: i,
                  isUseMultipleRangeRequest: t.isUseMultipleRangeRequest,
                  requestHeaders: e.requestHeaders,
                }
              ).download();
            } catch (e) {
              this._logger.error(
                "Cannot download differentially, fallback to full download: " +
                  (e.stack || e)
              ),
                (u = "linux" === process.platform);
            }
            u && (await this.httpExecutor.download(n.url, i, o)),
              await (0, s().chmod)(i, 493);
          },
        });
      }
      doInstall(e) {
        const t = process.env.APPIMAGE;
        if (null == t)
          throw (0, r().newError)(
            "APPIMAGE env is not defined",
            "ERR_UPDATER_OLD_FILE_NOT_FOUND"
          );
        let n;
        (0, o.unlinkSync)(t);
        const s = a.basename(t);
        (n =
          a.basename(e.installerPath) !== s && /\d+\.\d+\.\d+/.test(s)
            ? a.join(a.dirname(t), a.basename(e.installerPath))
            : t),
          (0, i().execFileSync)("mv", ["-f", e.installerPath, n]);
        const u = { ...process.env, APPIMAGE_SILENT_INSTALL: "true" };
        return (
          e.isForceRunAfter
            ? (0, i().spawn)(n, [], {
                detached: !0,
                stdio: "ignore",
                env: u,
              }).unref()
            : ((u.APPIMAGE_EXIT_AFTER_INSTALL = "true"),
              (0, i().execFileSync)(n, [], { env: u })),
          !0
        );
      }
    }
    t.AppImageUpdater = d;
  },
  "./node_modules/electron-updater/out/AppUpdater.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("crypto");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("electron");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n("events");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      const e = n("./node_modules/js-yaml/index.js");
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    function c() {
      const e = n("./node_modules/lazy-val/out/main.js");
      return (
        (c = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.NoOpLogger = t.AppUpdater = void 0);
    var l = (function (e) {
      if (e && e.__esModule) return e;
      if (null === e || ("object" != typeof e && "function" != typeof e))
        return { default: e };
      var t = v();
      if (t && t.has(e)) return t.get(e);
      var n = {},
        r = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var i in e)
        if (Object.prototype.hasOwnProperty.call(e, i)) {
          var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
          s && (s.get || s.set)
            ? Object.defineProperty(n, i, s)
            : (n[i] = e[i]);
        }
      (n.default = e), t && t.set(e, n);
      return n;
    })(n("path"));
    function h() {
      const e = n(
        "./node_modules/electron-updater/node_modules/semver/index.js"
      );
      return (
        (h = function () {
          return e;
        }),
        e
      );
    }
    function d() {
      const e = n(
        "./node_modules/electron-updater/out/DownloadedUpdateHelper.js"
      );
      return (
        (d = function () {
          return e;
        }),
        e
      );
    }
    function p() {
      const e = n("./node_modules/electron-updater/out/ElectronAppAdapter.js");
      return (
        (p = function () {
          return e;
        }),
        e
      );
    }
    function f() {
      const e = n(
        "./node_modules/electron-updater/out/electronHttpExecutor.js"
      );
      return (
        (f = function () {
          return e;
        }),
        e
      );
    }
    function m() {
      const e = n(
        "./node_modules/electron-updater/out/providers/GenericProvider.js"
      );
      return (
        (m = function () {
          return e;
        }),
        e
      );
    }
    function g() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (g = function () {
          return e;
        }),
        e
      );
    }
    function y() {
      const e = n("./node_modules/electron-updater/out/providerFactory.js");
      return (
        (y = function () {
          return e;
        }),
        e
      );
    }
    function v() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (v = function () {
          return e;
        }),
        e
      );
    }
    class E extends o().EventEmitter {
      constructor(e, t) {
        super(),
          (this.autoDownload = !0),
          (this.autoInstallOnAppQuit = !0),
          (this.allowPrerelease = !1),
          (this.fullChangelog = !1),
          (this.allowDowngrade = !1),
          (this._channel = null),
          (this.downloadedUpdateHelper = null),
          (this.requestHeaders = null),
          (this._logger = console),
          (this.signals = new (g().UpdaterSignal)(this)),
          (this._appUpdateConfigPath = null),
          (this.clientPromise = null),
          (this.stagingUserIdPromise = new (c().Lazy)(() =>
            this.getOrCreateStagingUserId()
          )),
          (this.configOnDisk = new (c().Lazy)(() => this.loadUpdateConfig())),
          (this.checkForUpdatesPromise = null),
          (this.updateInfoAndProvider = null),
          (this._testOnlyOptions = null),
          this.on("error", (e) => {
            this._logger.error("Error: " + (e.stack || e.message));
          }),
          null == t
            ? ((this.app = new (p().ElectronAppAdapter)()),
              (this.httpExecutor = new (f().ElectronHttpExecutor)((e, t) =>
                this.emit("login", e, t)
              )))
            : ((this.app = t), (this.httpExecutor = null));
        const n = this.app.version,
          i = (0, h().parse)(n);
        if (null == i)
          throw (0, r().newError)(
            `App version is not a valid semver version: "${n}"`,
            "ERR_UPDATER_INVALID_VERSION"
          );
        (this.currentVersion = i),
          (this.allowPrerelease = (function (e) {
            const t = (0, h().prerelease)(e);
            return null != t && t.length > 0;
          })(i)),
          null != e &&
            (this.setFeedURL(e),
            "string" != typeof e &&
              e.requestHeaders &&
              (this.requestHeaders = e.requestHeaders));
      }
      get channel() {
        return this._channel;
      }
      set channel(e) {
        if (null != this._channel) {
          if ("string" != typeof e)
            throw (0, r().newError)(
              "Channel must be a string, but got: " + e,
              "ERR_UPDATER_INVALID_CHANNEL"
            );
          if (0 === e.length)
            throw (0, r().newError)(
              "Channel must be not an empty string",
              "ERR_UPDATER_INVALID_CHANNEL"
            );
        }
        (this._channel = e), (this.allowDowngrade = !0);
      }
      get netSession() {
        return (0, f().getNetSession)();
      }
      get logger() {
        return this._logger;
      }
      set logger(e) {
        this._logger = null == e ? new x() : e;
      }
      set updateConfigPath(e) {
        (this.clientPromise = null),
          (this._appUpdateConfigPath = e),
          (this.configOnDisk = new (c().Lazy)(() => this.loadUpdateConfig()));
      }
      getFeedURL() {
        return "Deprecated. Do not use it.";
      }
      setFeedURL(e) {
        const t = this.createProviderRuntimeOptions();
        let n;
        (n =
          "string" == typeof e
            ? new (m().GenericProvider)({ provider: "generic", url: e }, this, {
                ...t,
                isUseMultipleRangeRequest: (0,
                y().isUrlProbablySupportMultiRangeRequests)(e),
              })
            : (0, y().createClient)(e, this, t)),
          (this.clientPromise = Promise.resolve(n));
      }
      checkForUpdates() {
        let e = this.checkForUpdatesPromise;
        if (null != e)
          return (
            this._logger.info("Checking for update (already in progress)"), e
          );
        const t = () => (this.checkForUpdatesPromise = null);
        return (
          this._logger.info("Checking for update"),
          (e = this.doCheckForUpdates()
            .then((e) => (t(), e))
            .catch((e) => {
              throw (
                (t(),
                this.emit(
                  "error",
                  e,
                  "Cannot check for updates: " + (e.stack || e).toString()
                ),
                e)
              );
            })),
          (this.checkForUpdatesPromise = e),
          e
        );
      }
      isUpdaterActive() {
        return (
          !!this.app.isPackaged ||
          (this._logger.info(
            "Skip checkForUpdatesAndNotify because application is not packed"
          ),
          !1)
        );
      }
      checkForUpdatesAndNotify(e) {
        return this.isUpdaterActive()
          ? this.checkForUpdates().then((t) => {
              const n = t.downloadPromise;
              if (null == n) {
                const e = this._logger.debug;
                return (
                  null != e &&
                    e(
                      "checkForUpdatesAndNotify called, downloadPromise is null"
                    ),
                  t
                );
              }
              return (
                n.then(() => {
                  const n = this.formatDownloadNotification(
                    t.updateInfo.version,
                    this.app.name,
                    e
                  );
                  new (s().Notification)(n).show();
                }),
                t
              );
            })
          : Promise.resolve(null);
      }
      formatDownloadNotification(e, t, n) {
        return (
          null == n &&
            (n = {
              title: "A new update is ready to install",
              body:
                "{appName} version {version} has been downloaded and will be automatically installed on exit",
            }),
          (n = {
            title: n.title.replace("{appName}", t).replace("{version}", e),
            body: n.body.replace("{appName}", t).replace("{version}", e),
          })
        );
      }
      async isStagingMatch(e) {
        const t = e.stagingPercentage;
        let n = t;
        if (null == n) return !0;
        if (((n = parseInt(n, 10)), isNaN(n)))
          return this._logger.warn("Staging percentage is NaN: " + t), !0;
        n /= 100;
        const i = await this.stagingUserIdPromise.value,
          s = r().UUID.parse(i).readUInt32BE(12) / 4294967295;
        return (
          this._logger.info(
            `Staging percentage: ${n}, percentage: ${s}, user id: ${i}`
          ),
          s < n
        );
      }
      computeFinalHeaders(e) {
        return (
          null != this.requestHeaders && Object.assign(e, this.requestHeaders),
          e
        );
      }
      async isUpdateAvailable(e) {
        const t = (0, h().parse)(e.version);
        if (null == t)
          throw (0, r().newError)(
            `This file could not be downloaded, or the latest version (from update server) does not have a valid semver version: "${e.version}"`,
            "ERR_UPDATER_INVALID_VERSION"
          );
        const n = this.currentVersion;
        if ((0, h().eq)(t, n)) return !1;
        if (!(await this.isStagingMatch(e))) return !1;
        const i = (0, h().gt)(t, n),
          s = (0, h().lt)(t, n);
        return !!i || (this.allowDowngrade && s);
      }
      async getUpdateInfoAndProvider() {
        await this.app.whenReady(),
          null == this.clientPromise &&
            (this.clientPromise = this.configOnDisk.value.then((e) =>
              (0, y().createClient)(
                e,
                this,
                this.createProviderRuntimeOptions()
              )
            ));
        const e = await this.clientPromise,
          t = await this.stagingUserIdPromise.value;
        return (
          e.setRequestHeaders(
            this.computeFinalHeaders({ "x-user-staging-id": t })
          ),
          { info: await e.getLatestVersion(), provider: e }
        );
      }
      createProviderRuntimeOptions() {
        return {
          isUseMultipleRangeRequest: !0,
          platform:
            null == this._testOnlyOptions
              ? process.platform
              : this._testOnlyOptions.platform,
          executor: this.httpExecutor,
        };
      }
      async doCheckForUpdates() {
        this.emit("checking-for-update");
        const e = await this.getUpdateInfoAndProvider(),
          t = e.info;
        if (!(await this.isUpdateAvailable(t)))
          return (
            this._logger.info(
              `Update for version ${
                this.currentVersion
              } is not available (latest version: ${t.version}, downgrade is ${
                this.allowDowngrade ? "allowed" : "disallowed"
              }).`
            ),
            this.emit("update-not-available", t),
            { versionInfo: t, updateInfo: t }
          );
        (this.updateInfoAndProvider = e), this.onUpdateAvailable(t);
        const n = new (r().CancellationToken)();
        return {
          versionInfo: t,
          updateInfo: t,
          cancellationToken: n,
          downloadPromise: this.autoDownload ? this.downloadUpdate(n) : null,
        };
      }
      onUpdateAvailable(e) {
        this._logger.info(
          `Found version ${e.version} (url: ${(0, r().asArray)(e.files)
            .map((e) => e.url)
            .join(", ")})`
        ),
          this.emit("update-available", e);
      }
      downloadUpdate(e = new (r().CancellationToken)()) {
        const t = this.updateInfoAndProvider;
        if (null == t) {
          const e = new Error("Please check update first");
          return this.dispatchError(e), Promise.reject(e);
        }
        this._logger.info(
          "Downloading update from " +
            (0, r().asArray)(t.info.files)
              .map((e) => e.url)
              .join(", ")
        );
        const n = (e) => {
          if (!(e instanceof r().CancellationError))
            try {
              this.dispatchError(e);
            } catch (e) {
              this._logger.warn(
                "Cannot dispatch error event: " + (e.stack || e)
              );
            }
          return e;
        };
        try {
          return this.doDownloadUpdate({
            updateInfoAndProvider: t,
            requestHeaders: this.computeRequestHeaders(t.provider),
            cancellationToken: e,
          }).catch((e) => {
            throw n(e);
          });
        } catch (e) {
          return Promise.reject(n(e));
        }
      }
      dispatchError(e) {
        this.emit("error", e, (e.stack || e).toString());
      }
      dispatchUpdateDownloaded(e) {
        this.emit(g().UPDATE_DOWNLOADED, e);
      }
      async loadUpdateConfig() {
        return (
          null == this._appUpdateConfigPath &&
            (this._appUpdateConfigPath = this.app.appUpdateConfigPath),
          (0, u().safeLoad)(
            await (0, a().readFile)(this._appUpdateConfigPath, "utf-8")
          )
        );
      }
      computeRequestHeaders(e) {
        const t = e.fileExtraDownloadHeaders;
        if (null != t) {
          const e = this.requestHeaders;
          return null == e ? t : { ...t, ...e };
        }
        return this.computeFinalHeaders({ accept: "*/*" });
      }
      async getOrCreateStagingUserId() {
        const e = l.join(this.app.userDataPath, ".updaterId");
        try {
          const t = await (0, a().readFile)(e, "utf-8");
          if (r().UUID.check(t)) return t;
          this._logger.warn(
            "Staging user id file exists, but content was invalid: " + t
          );
        } catch (e) {
          "ENOENT" !== e.code &&
            this._logger.warn(
              "Couldn't read staging user ID, creating a blank one: " + e
            );
        }
        const t = r().UUID.v5((0, i().randomBytes)(4096), r().UUID.OID);
        this._logger.info("Generated new staging user ID: " + t);
        try {
          await (0, a().outputFile)(e, t);
        } catch (e) {
          this._logger.warn("Couldn't write out staging user ID: " + e);
        }
        return t;
      }
      get isAddNoCacheQuery() {
        const e = this.requestHeaders;
        if (null == e) return !0;
        for (const t of Object.keys(e)) {
          const e = t.toLowerCase();
          if ("authorization" === e || "private-token" === e) return !1;
        }
        return !0;
      }
      async getOrCreateDownloadHelper() {
        let e = this.downloadedUpdateHelper;
        if (null == e) {
          const t = (await this.configOnDisk.value).updaterCacheDirName,
            n = this._logger;
          null == t &&
            n.error(
              "updaterCacheDirName is not specified in app-update.yml Was app build using at least electron-builder 20.34.0?"
            );
          const r = l.join(this.app.baseCachePath, t || this.app.name);
          null != n.debug && n.debug("updater cache dir: " + r),
            (e = new (d().DownloadedUpdateHelper)(r)),
            (this.downloadedUpdateHelper = e);
        }
        return e;
      }
      async executeDownload(e) {
        const t = e.fileInfo,
          n = {
            headers: e.downloadUpdateOptions.requestHeaders,
            cancellationToken: e.downloadUpdateOptions.cancellationToken,
            sha2: t.info.sha2,
            sha512: t.info.sha512,
          };
        this.listenerCount(g().DOWNLOAD_PROGRESS) > 0 &&
          (n.onProgress = (e) => this.emit(g().DOWNLOAD_PROGRESS, e));
        const i = e.downloadUpdateOptions.updateInfoAndProvider.info,
          s = i.version,
          o = t.packageInfo;
        const u = await this.getOrCreateDownloadHelper(),
          c = u.cacheDirForPendingUpdate;
        await (0, a().ensureDir)(c);
        const h = (function () {
          const t = decodeURIComponent(e.fileInfo.url.pathname);
          return t.endsWith("." + e.fileExtension)
            ? l.posix.basename(t)
            : "update." + e.fileExtension;
        })();
        let p = l.join(c, h);
        const f =
            null == o
              ? null
              : l.join(c, `package-${s}${l.extname(o.path) || ".7z"}`),
          m = async (n) => (
            await u.setDownloadedFile(p, f, i, t, h, n),
            await e.done({ ...i, downloadedFile: p }),
            null == f ? [p] : [p, f]
          ),
          y = this._logger,
          v = await u.validateDownloadedPath(p, i, t, y);
        if (null != v) return (p = v), await m(!1);
        const E = async () => (
            await u.clear().catch(() => {}),
            await (0, a().unlink)(p).catch(() => {})
          ),
          x = await (0, d().createTempUpdateFile)("temp-" + h, c, y);
        try {
          await e.task(x, n, f, E), await (0, a().rename)(x, p);
        } catch (e) {
          throw (
            (await E(),
            e instanceof r().CancellationError &&
              (y.info("cancelled"), this.emit("update-cancelled", i)),
            e)
          );
        }
        return (
          y.info(`New version ${s} has been downloaded to ${p}`), await m(!0)
        );
      }
    }
    t.AppUpdater = E;
    class x {
      info(e) {}
      warn(e) {}
      error(e) {}
    }
    t.NoOpLogger = x;
  },
  "./node_modules/electron-updater/out/BaseUpdater.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/electron-updater/out/AppUpdater.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.BaseUpdater = void 0);
    class i extends r().AppUpdater {
      constructor(e, t) {
        super(e, t),
          (this.quitAndInstallCalled = !1),
          (this.quitHandlerAdded = !1);
      }
      quitAndInstall(e = !1, t = !1) {
        this._logger.info("Install on explicit quitAndInstall");
        this.install(e, !e || t)
          ? setImmediate(() => {
              this.app.quit();
            })
          : (this.quitAndInstallCalled = !1);
      }
      executeDownload(e) {
        return super.executeDownload({
          ...e,
          done: async (e) => {
            this.dispatchUpdateDownloaded(e), this.addQuitHandler();
          },
        });
      }
      install(e, t) {
        if (this.quitAndInstallCalled)
          return (
            this._logger.warn(
              "install call ignored: quitAndInstallCalled is set to true"
            ),
            !1
          );
        const n = this.downloadedUpdateHelper,
          r = null == n ? null : n.file,
          i = null == n ? null : n.downloadedFileInfo;
        if (null == r || null == i)
          return (
            this.dispatchError(
              new Error("No valid update available, can't quit and install")
            ),
            !1
          );
        this.quitAndInstallCalled = !0;
        try {
          return (
            this._logger.info(`Install: isSilent: ${e}, isForceRunAfter: ${t}`),
            this.doInstall({
              installerPath: r,
              isSilent: e,
              isForceRunAfter: t,
              isAdminRightsRequired: i.isAdminRightsRequired,
            })
          );
        } catch (e) {
          return this.dispatchError(e), !1;
        }
      }
      addQuitHandler() {
        !this.quitHandlerAdded &&
          this.autoInstallOnAppQuit &&
          ((this.quitHandlerAdded = !0),
          this.app.onQuit((e) => {
            this.quitAndInstallCalled
              ? this._logger.info(
                  "Update installer has already been triggered. Quitting application."
                )
              : 0 === e
              ? (this._logger.info("Auto install update on quit"),
                this.install(!0, !1))
              : this._logger.info(
                  "Update will be not installed on quit because application is quitting with exit code " +
                    e
                );
          }));
      }
    }
    t.BaseUpdater = i;
  },
  "./node_modules/electron-updater/out/DownloadedUpdateHelper.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("crypto");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.createTempUpdateFile = async function (e, t, n) {
        let r = 0,
          i = a.join(t, e);
        for (let s = 0; s < 3; s++)
          try {
            return await (0, o().unlink)(i), i;
          } catch (s) {
            if ("ENOENT" === s.code) return i;
            n.warn("Error on remove temp update file: " + s),
              (i = a.join(t, `${r++}-${e}`));
          }
        return i;
      }),
      (t.DownloadedUpdateHelper = void 0);
    var i = n("fs");
    function s() {
      const e =
        (t = n("./node_modules/lodash.isequal/index.js")) && t.__esModule
          ? t
          : { default: t };
      var t;
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    var a = (function (e) {
      if (e && e.__esModule) return e;
      if (null === e || ("object" != typeof e && "function" != typeof e))
        return { default: e };
      var t = u();
      if (t && t.has(e)) return t.get(e);
      var n = {},
        r = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var i in e)
        if (Object.prototype.hasOwnProperty.call(e, i)) {
          var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
          s && (s.get || s.set)
            ? Object.defineProperty(n, i, s)
            : (n[i] = e[i]);
        }
      (n.default = e), t && t.set(e, n);
      return n;
    })(n("path"));
    function u() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    t.DownloadedUpdateHelper = class {
      constructor(e) {
        (this.cacheDir = e),
          (this._file = null),
          (this._packageFile = null),
          (this.versionInfo = null),
          (this.fileInfo = null),
          (this._downloadedFileInfo = null);
      }
      get downloadedFileInfo() {
        return this._downloadedFileInfo;
      }
      get file() {
        return this._file;
      }
      get packageFile() {
        return this._packageFile;
      }
      get cacheDirForPendingUpdate() {
        return a.join(this.cacheDir, "pending");
      }
      async validateDownloadedPath(e, t, n, r) {
        if (
          null != this.versionInfo &&
          this.file === e &&
          null != this.fileInfo
        )
          return (0, s().default)(this.versionInfo, t) &&
            (0, s().default)(this.fileInfo.info, n.info) &&
            (await (0, o().pathExists)(e))
            ? e
            : null;
        const i = await this.getValidCachedUpdateFile(n, r);
        return null === i
          ? null
          : (r.info(`Update has already been downloaded to ${e}).`),
            (this._file = i),
            i);
      }
      async setDownloadedFile(e, t, n, r, i, s) {
        (this._file = e),
          (this._packageFile = t),
          (this.versionInfo = n),
          (this.fileInfo = r),
          (this._downloadedFileInfo = {
            fileName: i,
            sha512: r.info.sha512,
            isAdminRightsRequired: !0 === r.info.isAdminRightsRequired,
          }),
          s &&
            (await (0, o().outputJson)(
              this.getUpdateInfoFile(),
              this._downloadedFileInfo
            ));
      }
      async clear() {
        (this._file = null),
          (this._packageFile = null),
          (this.versionInfo = null),
          (this.fileInfo = null),
          await this.cleanCacheDirForPendingUpdate();
      }
      async cleanCacheDirForPendingUpdate() {
        try {
          await (0, o().emptyDir)(this.cacheDirForPendingUpdate);
        } catch (e) {}
      }
      async getValidCachedUpdateFile(e, t) {
        var n;
        const s = this.getUpdateInfoFile();
        if (!(await (0, o().pathExistsSync)(s))) return null;
        let u;
        try {
          u = await (0, o().readJson)(s);
        } catch (e) {
          let n = "No cached update info available";
          return (
            "ENOENT" !== e.code &&
              (await this.cleanCacheDirForPendingUpdate(),
              (n += ` (error on read: ${e.message})`)),
            t.info(n),
            null
          );
        }
        if (
          !(
            null !== (n = null !== (null == u ? void 0 : u.fileName)) &&
            void 0 !== n &&
            n
          )
        )
          return (
            t.warn(
              "Cached update info is corrupted: no fileName, directory for cached update will be cleaned"
            ),
            await this.cleanCacheDirForPendingUpdate(),
            null
          );
        if (e.info.sha512 !== u.sha512)
          return (
            t.info(
              `Cached update sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${u.sha512}, expected: ${e.info.sha512}. Directory for cached update will be cleaned`
            ),
            await this.cleanCacheDirForPendingUpdate(),
            null
          );
        const c = a.join(this.cacheDirForPendingUpdate, u.fileName);
        if (!(await (0, o().pathExists)(c)))
          return (
            t.info(
              "Cached update file doesn't exist, directory for cached update will be cleaned"
            ),
            await this.cleanCacheDirForPendingUpdate(),
            null
          );
        const l = await (function (e, t = "sha512", n = "base64", s) {
          return new Promise((o, a) => {
            const u = (0, r().createHash)(t);
            u.on("error", a).setEncoding(n),
              (0, i.createReadStream)(e, { ...s, highWaterMark: 1048576 })
                .on("error", a)
                .on("end", () => {
                  u.end(), o(u.read());
                })
                .pipe(u, { end: !1 });
          });
        })(c);
        return e.info.sha512 !== l
          ? (t.warn(
              `Sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${l}, expected: ${e.info.sha512}`
            ),
            await this.cleanCacheDirForPendingUpdate(),
            null)
          : ((this._downloadedFileInfo = u), c);
      }
      getUpdateInfoFile() {
        return a.join(this.cacheDirForPendingUpdate, "update-info.json");
      }
    };
  },
  "./node_modules/electron-updater/out/ElectronAppAdapter.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.ElectronAppAdapter = void 0);
    var r = (function (e) {
      if (e && e.__esModule) return e;
      if (null === e || ("object" != typeof e && "function" != typeof e))
        return { default: e };
      var t = s();
      if (t && t.has(e)) return t.get(e);
      var n = {},
        r = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var i in e)
        if (Object.prototype.hasOwnProperty.call(e, i)) {
          var o = r ? Object.getOwnPropertyDescriptor(e, i) : null;
          o && (o.get || o.set)
            ? Object.defineProperty(n, i, o)
            : (n[i] = e[i]);
        }
      (n.default = e), t && t.set(e, n);
      return n;
    })(n("path"));
    function i() {
      const e = n("./node_modules/electron-updater/out/AppAdapter.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    t.ElectronAppAdapter = class {
      constructor(e = n("electron").app) {
        this.app = e;
      }
      whenReady() {
        return this.app.whenReady();
      }
      get version() {
        return this.app.getVersion();
      }
      get name() {
        return this.app.getName();
      }
      get isPackaged() {
        return !0 === this.app.isPackaged;
      }
      get appUpdateConfigPath() {
        return this.isPackaged
          ? r.join(process.resourcesPath, "app-update.yml")
          : r.join(this.app.getAppPath(), "dev-app-update.yml");
      }
      get userDataPath() {
        return this.app.getPath("userData");
      }
      get baseCachePath() {
        return (0, i().getAppCacheDir)();
      }
      quit() {
        this.app.quit();
      }
      onQuit(e) {
        this.app.once("quit", (t, n) => e(n));
      }
    };
  },
  "./node_modules/electron-updater/out/MacUpdater.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.MacUpdater = void 0);
    var s = n("fs");
    function o() {
      const e = n("http");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n("./node_modules/electron-updater/out/AppUpdater.js");
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    class c extends a().AppUpdater {
      constructor(e, t) {
        super(e, t),
          (this.nativeUpdater = n("electron").autoUpdater),
          (this.updateInfoForPendingUpdateDownloadedEvent = null),
          this.nativeUpdater.on("error", (e) => {
            this._logger.warn(e), this.emit("error", e);
          }),
          this.nativeUpdater.on("update-downloaded", () => {
            const e = this.updateInfoForPendingUpdateDownloadedEvent;
            (this.updateInfoForPendingUpdateDownloadedEvent = null),
              this.dispatchUpdateDownloaded(e);
          });
      }
      doDownloadUpdate(e) {
        this.updateInfoForPendingUpdateDownloadedEvent = null;
        const t = e.updateInfoAndProvider.provider.resolveFiles(
            e.updateInfoAndProvider.info
          ),
          n = (0, u().findFile)(t, "zip", ["pkg", "dmg"]);
        if (null == n)
          throw (0, r().newError)(
            "ZIP file not provided: " + (0, r().safeStringifyJson)(t),
            "ERR_UPDATER_ZIP_FILE_NOT_FOUND"
          );
        const a = (0, o().createServer)();
        function c() {
          return "http://127.0.0.1:" + a.address().port;
        }
        return (
          a.on("close", () => {
            this._logger.info(
              `Proxy server for native Squirrel.Mac is closed (was started to download ${n.url.href})`
            );
          }),
          this.executeDownload({
            fileExtension: "zip",
            fileInfo: n,
            downloadUpdateOptions: e,
            task: (e, t) => this.httpExecutor.download(n.url, e, t),
            done: async (e) => {
              const t = e.downloadedFile;
              this.updateInfoForPendingUpdateDownloadedEvent = e;
              let r = n.info.size;
              return (
                null == r && (r = (await (0, i().stat)(t)).size),
                await new Promise((e, n) => {
                  const i =
                    "/" +
                    Date.now() +
                    "-" +
                    Math.floor(9999 * Math.random()) +
                    ".zip";
                  a.on("request", (o, u) => {
                    const l = o.url;
                    if ((this._logger.info(l + " requested"), "/" === l)) {
                      const e = Buffer.from(`{ "url": "${c()}${i}" }`);
                      return (
                        u.writeHead(200, {
                          "Content-Type": "application/json",
                          "Content-Length": e.length,
                        }),
                        void u.end(e)
                      );
                    }
                    if (!l.startsWith(i))
                      return (
                        this._logger.warn(l + " requested, but not supported"),
                        u.writeHead(404),
                        void u.end()
                      );
                    this._logger.info(
                      `${i} requested by Squirrel.Mac, pipe ${t}`
                    );
                    let h = !1;
                    u.on("finish", () => {
                      try {
                        setImmediate(() => a.close());
                      } finally {
                        h ||
                          (this.nativeUpdater.removeListener("error", n),
                          e([]));
                      }
                    });
                    const d = (0, s.createReadStream)(t);
                    d.on("error", (e) => {
                      try {
                        u.end();
                      } catch (e) {
                        this._logger.warn("cannot end response: " + e);
                      }
                      (h = !0),
                        this.nativeUpdater.removeListener("error", n),
                        n(new Error(`Cannot pipe "${t}": ${e}`));
                    }),
                      u.writeHead(200, {
                        "Content-Type": "application/zip",
                        "Content-Length": r,
                      }),
                      d.pipe(u);
                  }),
                    a.listen(0, "127.0.0.1", () => {
                      this.nativeUpdater.setFeedURL({
                        url: c(),
                        headers: { "Cache-Control": "no-cache" },
                      }),
                        this.nativeUpdater.once("error", n),
                        this.nativeUpdater.checkForUpdates();
                    });
                })
              );
            },
          })
        );
      }
      quitAndInstall() {
        this.nativeUpdater.quitAndInstall();
      }
    }
    t.MacUpdater = c;
  },
  "./node_modules/electron-updater/out/NsisUpdater.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("child_process");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.NsisUpdater = void 0);
    var s = (function (e) {
      if (e && e.__esModule) return e;
      if (null === e || ("object" != typeof e && "function" != typeof e))
        return { default: e };
      var t = m();
      if (t && t.has(e)) return t.get(e);
      var n = {},
        r = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var i in e)
        if (Object.prototype.hasOwnProperty.call(e, i)) {
          var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
          s && (s.get || s.set)
            ? Object.defineProperty(n, i, s)
            : (n[i] = e[i]);
        }
      (n.default = e), t && t.set(e, n);
      return n;
    })(n("path"));
    function o() {
      const e = n("./node_modules/electron-updater/out/BaseUpdater.js");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js"
      );
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/GenericDifferentialDownloader.js"
      );
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    function c() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (c = function () {
          return e;
        }),
        e
      );
    }
    function l() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (l = function () {
          return e;
        }),
        e
      );
    }
    function h() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (h = function () {
          return e;
        }),
        e
      );
    }
    function d() {
      const e = n(
        "./node_modules/electron-updater/out/windowsExecutableCodeSignatureVerifier.js"
      );
      return (
        (d = function () {
          return e;
        }),
        e
      );
    }
    function p() {
      const e = n("url");
      return (
        (p = function () {
          return e;
        }),
        e
      );
    }
    function f() {
      const e = n("zlib");
      return (
        (f = function () {
          return e;
        }),
        e
      );
    }
    function m() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (m = function () {
          return e;
        }),
        e
      );
    }
    class g extends o().BaseUpdater {
      constructor(e, t) {
        super(e, t);
      }
      doDownloadUpdate(e) {
        const t = e.updateInfoAndProvider.provider,
          n = (0, l().findFile)(
            t.resolveFiles(e.updateInfoAndProvider.info),
            "exe"
          );
        return this.executeDownload({
          fileExtension: "exe",
          downloadUpdateOptions: e,
          fileInfo: n,
          task: async (i, s, o, a) => {
            if (v(i) || (null != o && v(o)))
              throw (0, r().newError)(
                "destinationFile or packageFile contains illegal chars",
                "ERR_UPDATER_ILLEGAL_FILE_NAME"
              );
            const u = n.packageInfo,
              c = null != u && null != o;
            (c || (await this.differentialDownloadInstaller(n, e, i, t))) &&
              (await this.httpExecutor.download(n.url, i, s));
            const l = await this.verifySignature(i);
            if (null != l)
              throw (
                (await a(),
                (0, r().newError)(
                  `New version ${e.updateInfoAndProvider.info.version} is not signed by the application owner: ${l}`,
                  "ERR_UPDATER_INVALID_SIGNATURE"
                ))
              );
            if (c && (await this.differentialDownloadWebPackage(u, o, t)))
              try {
                await this.httpExecutor.download(new (p().URL)(u.path), o, {
                  headers: e.requestHeaders,
                  cancellationToken: e.cancellationToken,
                  sha512: u.sha512,
                });
              } catch (e) {
                try {
                  await (0, h().unlink)(o);
                } catch (e) {}
                throw e;
              }
          },
        });
      }
      async verifySignature(e) {
        let t;
        try {
          if (((t = (await this.configOnDisk.value).publisherName), null == t))
            return null;
        } catch (e) {
          if ("ENOENT" === e.code) return null;
          throw e;
        }
        return await (0, d().verifySignature)(
          Array.isArray(t) ? t : [t],
          e,
          this._logger
        );
      }
      doInstall(e) {
        const t = ["--updated"];
        e.isSilent && t.push("/S"), e.isForceRunAfter && t.push("--force-run");
        const n =
          null == this.downloadedUpdateHelper
            ? null
            : this.downloadedUpdateHelper.packageFile;
        null != n && t.push("--package-file=" + n);
        const r = () => {
          y(
            s.join(process.resourcesPath, "elevate.exe"),
            [e.installerPath].concat(t)
          ).catch((e) => this.dispatchError(e));
        };
        return e.isAdminRightsRequired
          ? (this._logger.info(
              "isAdminRightsRequired is set to true, run installer using elevate.exe"
            ),
            r(),
            !0)
          : (y(e.installerPath, t).catch((e) => {
              const t = e.code;
              this._logger.info(
                `Cannot run installer: error code: ${t}, error message: "${e.message}", will be executed again using elevate if EACCES"`
              ),
                "UNKNOWN" === t || "EACCES" === t ? r() : this.dispatchError(e);
            }),
            !0);
      }
      async differentialDownloadInstaller(e, t, n, i) {
        try {
          if (
            null != this._testOnlyOptions &&
            !this._testOnlyOptions.isUseDifferentialDownload
          )
            return !0;
          const o = (0, c().newUrlFromBase)(
              e.url.pathname + ".blockmap",
              e.url
            ),
            a = (0, c().newUrlFromBase)(
              e.url.pathname.replace(
                new RegExp(t.updateInfoAndProvider.info.version, "g"),
                this.app.version
              ) + ".blockmap",
              e.url
            );
          this._logger.info(
            `Download block maps (old: "${a.href}", new: ${o.href})`
          );
          const l = async (e) => {
              const n = await this.httpExecutor.downloadToBuffer(e, {
                headers: t.requestHeaders,
                cancellationToken: t.cancellationToken,
              });
              if (null == n || 0 === n.length)
                throw new Error(`Blockmap "${e.href}" is empty`);
              try {
                return JSON.parse((0, f().gunzipSync)(n).toString());
              } catch (t) {
                throw new Error(
                  `Cannot parse blockmap "${e.href}", error: ${t}, raw data: ${n}`
                );
              }
            },
            h = await Promise.all([l(a), l(o)]);
          return (
            await new (u().GenericDifferentialDownloader)(
              e.info,
              this.httpExecutor,
              {
                newUrl: e.url,
                oldFile: s.join(
                  this.downloadedUpdateHelper.cacheDir,
                  r().CURRENT_APP_INSTALLER_FILE_NAME
                ),
                logger: this._logger,
                newFile: n,
                isUseMultipleRangeRequest: i.isUseMultipleRangeRequest,
                requestHeaders: t.requestHeaders,
              }
            ).download(h[0], h[1]),
            !1
          );
        } catch (e) {
          if (
            (this._logger.error(
              "Cannot download differentially, fallback to full download: " +
                (e.stack || e)
            ),
            null != this._testOnlyOptions)
          )
            throw e;
          return !0;
        }
      }
      async differentialDownloadWebPackage(e, t, n) {
        if (null == e.blockMapSize) return !0;
        try {
          await new (a().FileWithEmbeddedBlockMapDifferentialDownloader)(
            e,
            this.httpExecutor,
            {
              newUrl: new (p().URL)(e.path),
              oldFile: s.join(
                this.downloadedUpdateHelper.cacheDir,
                r().CURRENT_APP_PACKAGE_FILE_NAME
              ),
              logger: this._logger,
              newFile: t,
              requestHeaders: this.requestHeaders,
              isUseMultipleRangeRequest: n.isUseMultipleRangeRequest,
            }
          ).download();
        } catch (e) {
          return (
            this._logger.error(
              "Cannot download differentially, fallback to full download: " +
                (e.stack || e)
            ),
            "win32" === process.platform
          );
        }
        return !1;
      }
    }
    async function y(e, t) {
      return new Promise((n, r) => {
        try {
          const s = (0, i().spawn)(e, t, { detached: !0, stdio: "ignore" });
          s.on("error", (e) => {
            r(e);
          }),
            s.unref(),
            void 0 !== s.pid && n(!0);
        } catch (e) {
          r(e);
        }
      });
    }
    function v(e) {
      return e.includes("'") || e.includes('"') || e.includes("`");
    }
    t.NsisUpdater = g;
  },
  "./node_modules/electron-updater/out/differentialDownloader/DataSplitter.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.copyData = c),
      (t.DataSplitter = void 0);
    var i = n("fs");
    function s() {
      const e = n("stream");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js"
      );
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    const a = Buffer.from("\r\n\r\n");
    var u;
    function c(e, t, n, r, s) {
      const o = (0, i.createReadStream)("", {
        fd: n,
        autoClose: !1,
        start: e.start,
        end: e.end - 1,
      });
      o.on("error", r), o.once("end", s), o.pipe(t, { end: !1 });
    }
    !(function (e) {
      (e[(e.INIT = 0)] = "INIT"),
        (e[(e.HEADER = 1)] = "HEADER"),
        (e[(e.BODY = 2)] = "BODY");
    })(u || (u = {}));
    class l extends s().Writable {
      constructor(e, t, n, r, i, s) {
        super(),
          (this.out = e),
          (this.options = t),
          (this.partIndexToTaskIndex = n),
          (this.partIndexToLength = i),
          (this.finishHandler = s),
          (this.partIndex = -1),
          (this.headerListBuffer = null),
          (this.readState = u.INIT),
          (this.ignoreByteCount = 0),
          (this.remainingPartDataCount = 0),
          (this.actualPartLength = 0),
          (this.boundaryLength = r.length + 4),
          (this.ignoreByteCount = this.boundaryLength - 2);
      }
      get isFinished() {
        return this.partIndex === this.partIndexToLength.length;
      }
      _write(e, t, n) {
        this.isFinished
          ? console.error(`Trailing ignored data: ${e.length} bytes`)
          : this.handleData(e).then(n).catch(n);
      }
      async handleData(e) {
        let t = 0;
        if (0 !== this.ignoreByteCount && 0 !== this.remainingPartDataCount)
          throw (0, r().newError)(
            "Internal error",
            "ERR_DATA_SPLITTER_BYTE_COUNT_MISMATCH"
          );
        if (this.ignoreByteCount > 0) {
          const n = Math.min(this.ignoreByteCount, e.length);
          (this.ignoreByteCount -= n), (t = n);
        } else if (this.remainingPartDataCount > 0) {
          const n = Math.min(this.remainingPartDataCount, e.length);
          (this.remainingPartDataCount -= n),
            await this.processPartData(e, 0, n),
            (t = n);
        }
        if (t !== e.length) {
          if (this.readState === u.HEADER) {
            const n = this.searchHeaderListEnd(e, t);
            if (-1 === n) return;
            (t = n), (this.readState = u.BODY), (this.headerListBuffer = null);
          }
          for (;;) {
            if (this.readState === u.BODY) this.readState = u.INIT;
            else {
              this.partIndex++;
              let n = this.partIndexToTaskIndex.get(this.partIndex);
              if (null == n) {
                if (!this.isFinished)
                  throw (0, r().newError)(
                    "taskIndex is null",
                    "ERR_DATA_SPLITTER_TASK_INDEX_IS_NULL"
                  );
                n = this.options.end;
              }
              const i =
                0 === this.partIndex
                  ? this.options.start
                  : this.partIndexToTaskIndex.get(this.partIndex - 1) + 1;
              if (i < n) await this.copyExistingData(i, n);
              else if (i > n)
                throw (0, r().newError)(
                  "prevTaskIndex must be < taskIndex",
                  "ERR_DATA_SPLITTER_TASK_INDEX_ASSERT_FAILED"
                );
              if (this.isFinished)
                return this.onPartEnd(), void this.finishHandler();
              if (((t = this.searchHeaderListEnd(e, t)), -1 === t))
                return void (this.readState = u.HEADER);
            }
            const n = this.partIndexToLength[this.partIndex],
              i = t + n,
              s = Math.min(i, e.length);
            if (
              (await this.processPartStarted(e, t, s),
              (this.remainingPartDataCount = n - (s - t)),
              this.remainingPartDataCount > 0)
            )
              return;
            if (((t = i + this.boundaryLength), t >= e.length))
              return void (this.ignoreByteCount =
                this.boundaryLength - (e.length - i));
          }
        }
      }
      copyExistingData(e, t) {
        return new Promise((n, r) => {
          const i = () => {
            if (e === t) return void n();
            const s = this.options.tasks[e];
            s.kind === o().OperationKind.COPY
              ? c(s, this.out, this.options.oldFileFd, r, () => {
                  e++, i();
                })
              : r(new Error("Task kind must be COPY"));
          };
          i();
        });
      }
      searchHeaderListEnd(e, t) {
        const n = e.indexOf(a, t);
        if (-1 !== n) return n + a.length;
        const r = 0 === t ? e : e.slice(t);
        return (
          null == this.headerListBuffer
            ? (this.headerListBuffer = r)
            : (this.headerListBuffer = Buffer.concat([
                this.headerListBuffer,
                r,
              ])),
          -1
        );
      }
      onPartEnd() {
        const e = this.partIndexToLength[this.partIndex - 1];
        if (this.actualPartLength !== e)
          throw (0, r().newError)(
            `Expected length: ${e} differs from actual: ${this.actualPartLength}`,
            "ERR_DATA_SPLITTER_LENGTH_MISMATCH"
          );
        this.actualPartLength = 0;
      }
      processPartStarted(e, t, n) {
        return (
          0 !== this.partIndex && this.onPartEnd(),
          this.processPartData(e, t, n)
        );
      }
      processPartData(e, t, n) {
        this.actualPartLength += n - t;
        const r = this.out;
        return r.write(0 === t && e.length === n ? e : e.slice(t, n))
          ? Promise.resolve()
          : new Promise((e, t) => {
              r.on("error", t),
                r.once("drain", () => {
                  r.removeListener("error", t), e();
                });
            });
      }
    }
    t.DataSplitter = l;
  },
  "./node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.DifferentialDownloader = void 0);
    var s = n("fs");
    function o() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/DataSplitter.js"
      );
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n("url");
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js"
      );
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    function c() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/multipleRangeDownloader.js"
      );
      return (
        (c = function () {
          return e;
        }),
        e
      );
    }
    function l(e, t = " KB") {
      return new Intl.NumberFormat("en").format((e / 1024).toFixed(2)) + t;
    }
    t.DifferentialDownloader = class {
      constructor(e, t, n) {
        (this.blockAwareFileInfo = e),
          (this.httpExecutor = t),
          (this.options = n),
          (this.fileMetadataBuffer = null),
          (this.logger = n.logger);
      }
      createRequestOptions() {
        const e = {
          headers: { ...this.options.requestHeaders, accept: "*/*" },
        };
        return (
          (0, r().configureRequestUrl)(this.options.newUrl, e),
          (0, r().configureRequestOptions)(e),
          e
        );
      }
      doDownload(e, t) {
        if (e.version !== t.version)
          throw new Error(
            `version is different (${e.version} - ${t.version}), full download is required`
          );
        const n = this.logger,
          r = (0, u().computeOperations)(e, t, n);
        null != n.debug && n.debug(JSON.stringify(r, null, 2));
        let i = 0,
          s = 0;
        for (const e of r) {
          const t = e.end - e.start;
          e.kind === u().OperationKind.DOWNLOAD ? (i += t) : (s += t);
        }
        const o = this.blockAwareFileInfo.size;
        if (
          i +
            s +
            (null == this.fileMetadataBuffer
              ? 0
              : this.fileMetadataBuffer.length) !==
          o
        )
          throw new Error(
            `Internal error, size mismatch: downloadSize: ${i}, copySize: ${s}, newSize: ${o}`
          );
        return (
          n.info(
            `Full: ${l(o)}, To download: ${l(i)} (${Math.round(
              i / (o / 100)
            )}%)`
          ),
          this.downloadFile(r)
        );
      }
      downloadFile(e) {
        const t = [],
          n = () =>
            Promise.all(
              t.map((e) =>
                (0, i().close)(e.descriptor).catch((t) => {
                  this.logger.error(`cannot close file "${e.path}": ${t}`);
                })
              )
            );
        return this.doDownloadFile(e, t)
          .then(n)
          .catch((e) =>
            n()
              .catch((t) => {
                try {
                  this.logger.error("cannot close files: " + t);
                } catch (e) {
                  try {
                    console.error(e);
                  } catch (e) {}
                }
                throw e;
              })
              .then(() => {
                throw e;
              })
          );
      }
      async doDownloadFile(e, t) {
        const n = await (0, i().open)(this.options.oldFile, "r");
        t.push({ descriptor: n, path: this.options.oldFile });
        const l = await (0, i().open)(this.options.newFile, "w");
        t.push({ descriptor: l, path: this.options.newFile });
        const h = (0, s.createWriteStream)(this.options.newFile, { fd: l });
        await new Promise((i, s) => {
          const l = [],
            d = new (r().DigestTransform)(this.blockAwareFileInfo.sha512);
          (d.isValidateOnEnd = !1),
            l.push(d),
            h.on("finish", () => {
              h.close(() => {
                t.splice(1, 1);
                try {
                  d.validate();
                } catch (e) {
                  return void s(e);
                }
                i();
              });
            }),
            l.push(h);
          let p = null;
          for (const e of l) e.on("error", s), (p = null == p ? e : p.pipe(e));
          const f = l[0];
          let m;
          if (this.options.isUseMultipleRangeRequest)
            return (
              (m = (0, c().executeTasksUsingMultipleRangeRequests)(
                this,
                e,
                f,
                n,
                s
              )),
              void m(0)
            );
          let g = 0,
            y = null;
          this.logger.info("Differential download: " + this.options.newUrl);
          const v = this.createRequestOptions();
          (v.redirect = "manual"),
            (m = (t) => {
              if (t >= e.length)
                return (
                  null != this.fileMetadataBuffer &&
                    f.write(this.fileMetadataBuffer),
                  void f.end()
                );
              const i = e[t++];
              if (i.kind === u().OperationKind.COPY)
                return void (0, o().copyData)(i, f, n, s, () => m(t));
              const c = `bytes=${i.start}-${i.end - 1}`;
              v.headers.range = c;
              const l = this.logger.debug;
              null != l && l("download range: " + c);
              const h = this.httpExecutor.createRequest(v, (e) => {
                e.statusCode >= 400 && s((0, r().createHttpError)(e)),
                  e.pipe(f, { end: !1 }),
                  e.once("end", () => {
                    100 == ++g ? ((g = 0), setTimeout(() => m(t), 1e3)) : m(t);
                  });
              });
              h.on("redirect", (e, t, n) => {
                this.logger.info(
                  "Redirect to " +
                    (function (e) {
                      const t = e.indexOf("?");
                      return t < 0 ? e : e.substring(0, t);
                    })(n)
                ),
                  (y = n),
                  (0, r().configureRequestUrl)(new (a().URL)(y), v),
                  h.followRedirect();
              }),
                this.httpExecutor.addErrorAndTimeoutHandlers(h, s),
                h.end();
            }),
            m(0);
        });
      }
      async readRemoteBytes(e, t) {
        const n = Buffer.allocUnsafe(t + 1 - e),
          r = this.createRequestOptions();
        r.headers.range = `bytes=${e}-${t}`;
        let i = 0;
        if (
          (await this.request(r, (e) => {
            e.copy(n, i), (i += e.length);
          }),
          i !== n.length)
        )
          throw new Error(
            `Received data length ${i} is not equal to expected ${n.length}`
          );
        return n;
      }
      request(e, t) {
        return new Promise((n, r) => {
          const i = this.httpExecutor.createRequest(e, (e) => {
            (0, c().checkIsRangesSupported)(e, r) &&
              (e.on("data", t), e.on("end", () => n()));
          });
          this.httpExecutor.addErrorAndTimeoutHandlers(i, r), i.end();
        });
      }
    };
  },
  "./node_modules/electron-updater/out/differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/fs-extra/lib/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js"
      );
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("zlib");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.FileWithEmbeddedBlockMapDifferentialDownloader = void 0);
    class o extends i().DifferentialDownloader {
      async download() {
        const e = this.blockAwareFileInfo,
          t = e.size,
          n = t - (e.blockMapSize + 4);
        this.fileMetadataBuffer = await this.readRemoteBytes(n, t - 1);
        const i = a(
          this.fileMetadataBuffer.slice(0, this.fileMetadataBuffer.length - 4)
        );
        await this.doDownload(
          await (async function (e) {
            const t = await (0, r().open)(e, "r");
            try {
              const e = (await (0, r().fstat)(t)).size,
                n = Buffer.allocUnsafe(4);
              await (0, r().read)(t, n, 0, n.length, e - n.length);
              const i = Buffer.allocUnsafe(n.readUInt32BE(0));
              return (
                await (0, r().read)(t, i, 0, i.length, e - n.length - i.length),
                await (0, r().close)(t),
                a(i)
              );
            } catch (e) {
              throw (await (0, r().close)(t), e);
            }
          })(this.options.oldFile),
          i
        );
      }
    }
    function a(e) {
      return JSON.parse((0, s().inflateRawSync)(e).toString());
    }
    t.FileWithEmbeddedBlockMapDifferentialDownloader = o;
  },
  "./node_modules/electron-updater/out/differentialDownloader/GenericDifferentialDownloader.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/DifferentialDownloader.js"
      );
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.GenericDifferentialDownloader = void 0);
    class i extends r().DifferentialDownloader {
      download(e, t) {
        return this.doDownload(e, t);
      }
    }
    t.GenericDifferentialDownloader = i;
  },
  "./node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r;
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.computeOperations = function (e, t, n) {
        const i = o(e.files),
          a = o(t.files);
        let u = null;
        const c = t.files[0],
          l = [],
          h = c.name,
          d = i.get(h);
        if (null == d) throw new Error(`no file ${h} in old blockmap`);
        const p = a.get(h);
        let f = 0;
        const { checksumToOffset: m, checksumToOldSize: g } = (function (
          e,
          t,
          n
        ) {
          const r = new Map(),
            i = new Map();
          let s = t;
          const o = n.debug;
          for (let t = 0; t < e.checksums.length; t++) {
            const n = e.checksums[t],
              a = e.sizes[t],
              u = i.get(n);
            if (void 0 === u) r.set(n, s), i.set(n, a);
            else if (null != o) {
              o(
                `${n} duplicated in blockmap ${
                  u === a ? "(same size)" : `(size: ${u}, this size: ${a})`
                }, it doesn't lead to broken differential downloader, just corresponding block will be skipped)`
              );
            }
            s += a;
          }
          return { checksumToOffset: r, checksumToOldSize: i };
        })(i.get(h), d.offset, n);
        let y = c.offset;
        for (let e = 0; e < p.checksums.length; y += p.sizes[e], e++) {
          const t = p.sizes[e],
            i = p.checksums[e];
          let o = m.get(i);
          null != o &&
            g.get(i) !== t &&
            (n.warn(
              `Checksum ("${i}") matches, but size differs (old: ${g.get(
                i
              )}, new: ${t})`
            ),
            (o = void 0)),
            void 0 === o
              ? (f++,
                null != u && u.kind === r.DOWNLOAD && u.end === y
                  ? (u.end += t)
                  : ((u = { kind: r.DOWNLOAD, start: y, end: y + t }),
                    s(u, l, i, e)))
              : null != u && u.kind === r.COPY && u.end === o
              ? (u.end += t)
              : ((u = { kind: r.COPY, start: o, end: o + t }), s(u, l, i, e));
        }
        f > 0 &&
          n.info(
            `File${
              "file" === c.name ? "" : " " + c.name
            } has ${f} changed blocks`
          );
        return l;
      }),
      (t.OperationKind = void 0),
      (t.OperationKind = r),
      (function (e) {
        (e[(e.COPY = 0)] = "COPY"), (e[(e.DOWNLOAD = 1)] = "DOWNLOAD");
      })(r || (t.OperationKind = r = {}));
    const i =
      "true" === process.env.DIFFERENTIAL_DOWNLOAD_PLAN_BUILDER_VALIDATE_RANGES;
    function s(e, t, n, s) {
      if (i && 0 !== t.length) {
        const i = t[t.length - 1];
        if (i.kind === e.kind && e.start < i.end && e.start > i.start) {
          const t = [i.start, i.end, e.start, e.end].reduce((e, t) =>
            e < t ? e : t
          );
          throw new Error(
            `operation (block index: ${s}, checksum: ${n}, kind: ${
              r[e.kind]
            }) overlaps previous operation (checksum: ${n}):\nabs: ${
              i.start
            } until ${i.end} and ${e.start} until ${e.end}\nrel: ${
              i.start - t
            } until ${i.end - t} and ${e.start - t} until ${e.end - t}`
          );
        }
      }
      t.push(e);
    }
    function o(e) {
      const t = new Map();
      for (const n of e) t.set(n.name, n);
      return t;
    }
  },
  "./node_modules/electron-updater/out/differentialDownloader/multipleRangeDownloader.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/DataSplitter.js"
      );
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n(
        "./node_modules/electron-updater/out/differentialDownloader/downloadPlanBuilder.js"
      );
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o(e, t) {
      if (e.statusCode >= 400) return t((0, r().createHttpError)(e)), !1;
      if (206 !== e.statusCode) {
        const n = (0, r().safeGetHeader)(e, "accept-ranges");
        if (null == n || "none" === n)
          return (
            t(
              new Error(
                `Server doesn't support Accept-Ranges (response code ${e.statusCode})`
              )
            ),
            !1
          );
      }
      return !0;
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.executeTasksUsingMultipleRangeRequests = function (e, t, n, a, u) {
        const c = (l) => {
          if (l >= t.length)
            return (
              null != e.fileMetadataBuffer && n.write(e.fileMetadataBuffer),
              void n.end()
            );
          const h = l + 1e3;
          !(function (e, t, n, a, u) {
            let c = "bytes=",
              l = 0;
            const h = new Map(),
              d = [];
            for (let e = t.start; e < t.end; e++) {
              const n = t.tasks[e];
              n.kind === s().OperationKind.DOWNLOAD &&
                ((c += `${n.start}-${n.end - 1}, `),
                h.set(l, e),
                l++,
                d.push(n.end - n.start));
            }
            if (l <= 1) {
              const r = (c) => {
                if (c >= t.end) return void a();
                const l = t.tasks[c++];
                if (l.kind === s().OperationKind.COPY)
                  (0, i().copyData)(l, n, t.oldFileFd, u, () => r(c));
                else {
                  const t = e.createRequestOptions();
                  t.headers.Range = `bytes=${l.start}-${l.end - 1}`;
                  const i = e.httpExecutor.createRequest(t, (e) => {
                    o(e, u) &&
                      (e.pipe(n, { end: !1 }), e.once("end", () => r(c)));
                  });
                  e.httpExecutor.addErrorAndTimeoutHandlers(i, u), i.end();
                }
              };
              return void r(t.start);
            }
            const p = e.createRequestOptions();
            p.headers.Range = c.substring(0, c.length - 2);
            const f = e.httpExecutor.createRequest(p, (e) => {
              if (!o(e, u)) return;
              const s = (0, r().safeGetHeader)(e, "content-type"),
                c = /^multipart\/.+?(?:; boundary=(?:(?:"(.+)")|(?:([^\s]+))))$/i.exec(
                  s
                );
              if (null == c)
                return void u(
                  new Error(
                    `Content-Type "multipart/byteranges" is expected, but got "${s}"`
                  )
                );
              const l = new (i().DataSplitter)(n, t, h, c[1] || c[2], d, a);
              l.on("error", u), e.pipe(l);
            });
            e.httpExecutor.addErrorAndTimeoutHandlers(f, u), f.end();
          })(
            e,
            { tasks: t, start: l, end: Math.min(t.length, h), oldFileFd: a },
            n,
            () => c(h),
            u
          );
        };
        return c;
      }),
      (t.checkIsRangesSupported = o);
  },
  "./node_modules/electron-updater/out/electronHttpExecutor.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("electron");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.getNetSession = s),
      (t.ElectronHttpExecutor = t.NET_SESSION_NAME = void 0);
    function s() {
      return i().session.fromPartition("electron-updater", { cache: !1 });
    }
    t.NET_SESSION_NAME = "electron-updater";
    class o extends r().HttpExecutor {
      constructor(e) {
        super(), (this.proxyLoginCallback = e), (this.cachedSession = null);
      }
      async download(e, t, n) {
        return await n.cancellationToken.createPromise((i, s, o) => {
          const a = { headers: n.headers || void 0, redirect: "manual" };
          (0, r().configureRequestUrl)(e, a),
            (0, r().configureRequestOptions)(a),
            this.doDownload(
              a,
              {
                destination: t,
                options: n,
                onCancel: o,
                callback: (e) => {
                  null == e ? i(t) : s(e);
                },
                responseHandler: null,
              },
              0
            );
        });
      }
      createRequest(e, t) {
        e.headers &&
          e.headers.Host &&
          ((e.host = e.headers.Host), delete e.headers.Host),
          null == this.cachedSession && (this.cachedSession = s());
        const n = i().net.request({ ...e, session: this.cachedSession });
        return (
          n.on("response", t),
          null != this.proxyLoginCallback &&
            n.on("login", this.proxyLoginCallback),
          n
        );
      }
      addRedirectHandlers(e, t, n, i, s) {
        e.on("redirect", (o, a, u) => {
          e.abort(),
            i > this.maxRedirects
              ? n(this.createMaxRedirectError())
              : s(r().HttpExecutor.prepareRedirectUrlOptions(u, t));
        });
      }
    }
    t.ElectronHttpExecutor = o;
  },
  "./node_modules/electron-updater/out/main.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("url");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/electron-updater/out/AppUpdater.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    let s;
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.getChannelFilename = function (e) {
        return e + ".yml";
      }),
      (t.newBaseUrl = function (e) {
        const t = new (r().URL)(e);
        t.pathname.endsWith("/") || (t.pathname += "/");
        return t;
      }),
      (t.newUrlFromBase = function (e, t, n = !1) {
        const i = new (r().URL)(e, t),
          s = t.search;
        null != s && 0 !== s.length
          ? (i.search = s)
          : n && (i.search = "noCache=" + Date.now().toString(32));
        return i;
      }),
      Object.defineProperty(t, "AppUpdater", {
        enumerable: !0,
        get: function () {
          return i().AppUpdater;
        },
      }),
      Object.defineProperty(t, "NoOpLogger", {
        enumerable: !0,
        get: function () {
          return i().NoOpLogger;
        },
      }),
      Object.defineProperty(t, "CancellationToken", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n("./node_modules/builder-util-runtime/out/index.js");
            return (
              function () {
                return e;
              },
              e
            );
          })().CancellationToken;
        },
      }),
      Object.defineProperty(t, "Provider", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n(
              "./node_modules/electron-updater/out/providers/Provider.js"
            );
            return (
              function () {
                return e;
              },
              e
            );
          })().Provider;
        },
      }),
      Object.defineProperty(t, "AppImageUpdater", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n(
              "./node_modules/electron-updater/out/AppImageUpdater.js"
            );
            return (
              function () {
                return e;
              },
              e
            );
          })().AppImageUpdater;
        },
      }),
      Object.defineProperty(t, "MacUpdater", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n("./node_modules/electron-updater/out/MacUpdater.js");
            return (
              function () {
                return e;
              },
              e
            );
          })().MacUpdater;
        },
      }),
      Object.defineProperty(t, "NsisUpdater", {
        enumerable: !0,
        get: function () {
          return (function () {
            const e = n("./node_modules/electron-updater/out/NsisUpdater.js");
            return (
              function () {
                return e;
              },
              e
            );
          })().NsisUpdater;
        },
      }),
      (t.UpdaterSignal = t.UPDATE_DOWNLOADED = t.DOWNLOAD_PROGRESS = void 0),
      Object.defineProperty(t, "autoUpdater", {
        enumerable: !0,
        get: () =>
          s ||
          ((s =
            "win32" === process.platform
              ? new (n(
                  "./node_modules/electron-updater/out/NsisUpdater.js"
                ).NsisUpdater)()
              : "darwin" === process.platform
              ? new (n(
                  "./node_modules/electron-updater/out/MacUpdater.js"
                ).MacUpdater)()
              : new (n(
                  "./node_modules/electron-updater/out/AppImageUpdater.js"
                ).AppImageUpdater)()),
          s),
      });
    t.DOWNLOAD_PROGRESS = "download-progress";
    t.UPDATE_DOWNLOADED = "update-downloaded";
    t.UpdaterSignal = class {
      constructor(e) {
        this.emitter = e;
      }
      login(e) {
        o(this.emitter, "login", e);
      }
      progress(e) {
        o(this.emitter, "download-progress", e);
      }
      updateDownloaded(e) {
        o(this.emitter, "update-downloaded", e);
      }
      updateCancelled(e) {
        o(this.emitter, "update-cancelled", e);
      }
    };
    function o(e, t, n) {
      e.on(t, n);
    }
  },
  "./node_modules/electron-updater/out/providerFactory.js": function (e, t, n) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n(
        "./node_modules/electron-updater/out/providers/BintrayProvider.js"
      );
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n(
        "./node_modules/electron-updater/out/providers/GenericProvider.js"
      );
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n(
        "./node_modules/electron-updater/out/providers/GitHubProvider.js"
      );
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n(
        "./node_modules/electron-updater/out/providers/PrivateGitHubProvider.js"
      );
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u(e) {
      return !e.includes("s3.amazonaws.com");
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.isUrlProbablySupportMultiRangeRequests = u),
      (t.createClient = function (e, t, n) {
        if ("string" == typeof e)
          throw (0, r().newError)(
            "Please pass PublishConfiguration object",
            "ERR_UPDATER_INVALID_PROVIDER_CONFIGURATION"
          );
        const c = e.provider;
        switch (c) {
          case "github": {
            const r = e,
              i =
                (r.private
                  ? process.env.GH_TOKEN || process.env.GITHUB_TOKEN
                  : null) || r.token;
            return null == i
              ? new (o().GitHubProvider)(r, t, n)
              : new (a().PrivateGitHubProvider)(r, t, i, n);
          }
          case "s3":
          case "spaces":
            return new (s().GenericProvider)(
              {
                provider: "generic",
                url: (0, r().getS3LikeProviderBaseUrl)(e),
                channel: e.channel || null,
              },
              t,
              { ...n, isUseMultipleRangeRequest: !1 }
            );
          case "generic": {
            const r = e;
            return new (s().GenericProvider)(r, t, {
              ...n,
              isUseMultipleRangeRequest:
                !1 !== r.useMultipleRangeRequest && u(r.url),
            });
          }
          case "bintray":
            return new (i().BintrayProvider)(e, n);
          default:
            throw (0, r().newError)(
              "Unsupported provider: " + c,
              "ERR_UPDATER_UNSUPPORTED_PROVIDER"
            );
        }
      });
  },
  "./node_modules/electron-updater/out/providers/BintrayProvider.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/builder-util-runtime/out/bintray.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("url");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.BintrayProvider = void 0);
    class u extends o().Provider {
      constructor(e, t) {
        super(t),
          (this.client = new (i().BintrayClient)(
            e,
            t.executor,
            new (r().CancellationToken)()
          )),
          (this.baseUrl = (0, o().newBaseUrl)(
            `https://dl.bintray.com/${this.client.owner}/${this.client.repo}`
          ));
      }
      setRequestHeaders(e) {
        super.setRequestHeaders(e), this.client.setRequestHeaders(e);
      }
      async getLatestVersion() {
        try {
          const e = await this.client.getVersion("_latest"),
            t = (0, o().getChannelFilename)(this.getDefaultChannelName()),
            n = await this.client.getVersionFiles(e.name),
            i = n.find(
              (e) => e.name.endsWith("_" + t) || e.name.endsWith("-" + t)
            );
          if (null == i)
            throw (0, r().newError)(
              `Cannot find channel file "${t}", existing files:\n${n
                .map((e) => JSON.stringify(e, null, 2))
                .join(",\n")}`,
              "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
            );
          const u = new (s().URL)(
            `https://dl.bintray.com/${this.client.owner}/${this.client.repo}/${i.name}`
          );
          return (0, a().parseUpdateInfo)(await this.httpRequest(u), t, u);
        } catch (e) {
          if ("statusCode" in e && 404 === e.statusCode)
            throw (0, r().newError)(
              "No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. " +
                (e.stack || e.message),
              "ERR_UPDATER_LATEST_VERSION_NOT_FOUND"
            );
          throw e;
        }
      }
      resolveFiles(e) {
        return (0, a().resolveFiles)(e, this.baseUrl);
      }
    }
    t.BintrayProvider = u;
  },
  "./node_modules/electron-updater/out/providers/GenericProvider.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.GenericProvider = void 0);
    class o extends i().Provider {
      constructor(e, t, n) {
        super(n),
          (this.configuration = e),
          (this.updater = t),
          (this.baseUrl = (0, i().newBaseUrl)(this.configuration.url));
      }
      get channel() {
        const e = this.updater.channel || this.configuration.channel;
        return null == e
          ? this.getDefaultChannelName()
          : this.getCustomChannelName(e);
      }
      async getLatestVersion() {
        const e = (0, i().getChannelFilename)(this.channel),
          t = (0, i().newUrlFromBase)(
            e,
            this.baseUrl,
            this.updater.isAddNoCacheQuery
          );
        for (let n = 0; ; n++)
          try {
            return (0, s().parseUpdateInfo)(await this.httpRequest(t), e, t);
          } catch (t) {
            if (t instanceof r().HttpError && 404 === t.statusCode)
              throw (0, r().newError)(
                `Cannot find channel "${e}" update info: ${
                  t.stack || t.message
                }`,
                "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
              );
            if ("ECONNREFUSED" === t.code && n < 3) {
              await new Promise((e, t) => {
                try {
                  setTimeout(e, 1e3 * n);
                } catch (e) {
                  t(e);
                }
              });
              continue;
            }
            throw t;
          }
      }
      resolveFiles(e) {
        return (0, s().resolveFiles)(e, this.baseUrl);
      }
    }
    t.GenericProvider = o;
  },
  "./node_modules/electron-updater/out/providers/GitHubProvider.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = (function (e) {
        if (e && e.__esModule) return e;
        if (null === e || ("object" != typeof e && "function" != typeof e))
          return { default: e };
        var t = u();
        if (t && t.has(e)) return t.get(e);
        var n = {},
          r = Object.defineProperty && Object.getOwnPropertyDescriptor;
        for (var i in e)
          if (Object.prototype.hasOwnProperty.call(e, i)) {
            var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
            s && (s.get || s.set)
              ? Object.defineProperty(n, i, s)
              : (n[i] = e[i]);
          }
        (n.default = e), t && t.set(e, n);
        return n;
      })(n("./node_modules/electron-updater/node_modules/semver/index.js"));
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("url");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.computeReleaseNotes = d),
      (t.GitHubProvider = t.BaseGitHubProvider = void 0);
    const c = /\/tag\/v?([^/]+)$/;
    class l extends o().Provider {
      constructor(e, t, n) {
        super({ ...n, isUseMultipleRangeRequest: !1 }),
          (this.options = e),
          (this.baseUrl = (0, o().newBaseUrl)((0, r().githubUrl)(e, t)));
        const i = "github.com" === t ? "api.github.com" : t;
        this.baseApiUrl = (0, o().newBaseUrl)((0, r().githubUrl)(e, i));
      }
      computeGithubBasePath(e) {
        const t = this.options.host;
        return null != t && "github.com" !== t && "api.github.com" !== t
          ? "/api/v3" + e
          : e;
      }
    }
    t.BaseGitHubProvider = l;
    function h(e) {
      const t = e.elementValueOrEmpty("content");
      return "No content." === t ? "" : t;
    }
    function d(e, t, n, r) {
      if (!t) return h(r);
      const s = [];
      for (const t of n.getElements("entry")) {
        const n = t
          .element("link")
          .attribute("href")
          .match(/\/tag\/v?([^/]+)$/)[1];
        i().lt(e, n) && s.push({ version: n, note: h(t) });
      }
      return s.sort((e, t) => i().rcompare(e.version, t.version));
    }
    t.GitHubProvider = class extends l {
      constructor(e, t, n) {
        super(e, "github.com", n), (this.options = e), (this.updater = t);
      }
      async getLatestVersion() {
        const e = new (r().CancellationToken)(),
          t = await this.httpRequest(
            (0, o().newUrlFromBase)(this.basePath + ".atom", this.baseUrl),
            { accept: "application/xml, application/atom+xml, text/xml, */*" },
            e
          ),
          n = (0, r().parseXml)(t);
        let i,
          s = n.element("entry", !1, "No published versions on GitHub");
        try {
          if (this.updater.allowPrerelease)
            i = s.element("link").attribute("href").match(c)[1];
          else {
            i = await this.getLatestVersionString(e);
            for (const e of n.getElements("entry"))
              if (e.element("link").attribute("href").match(c)[1] === i) {
                s = e;
                break;
              }
          }
        } catch (e) {
          throw (0, r().newError)(
            `Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${t}`,
            "ERR_UPDATER_INVALID_RELEASE_FEED"
          );
        }
        if (null == i)
          throw (0, r().newError)(
            "No published versions on GitHub",
            "ERR_UPDATER_NO_PUBLISHED_VERSIONS"
          );
        const u = (0, o().getChannelFilename)(this.getDefaultChannelName()),
          l = (0, o().newUrlFromBase)(
            this.getBaseDownloadPath(i, u),
            this.baseUrl
          ),
          h = this.createRequestOptions(l);
        let p;
        try {
          p = await this.executor.request(h, e);
        } catch (e) {
          if (
            !this.updater.allowPrerelease &&
            e instanceof r().HttpError &&
            404 === e.statusCode
          )
            throw (0, r().newError)(
              `Cannot find ${u} in the latest release artifacts (${l}): ${
                e.stack || e.message
              }`,
              "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
            );
          throw e;
        }
        const f = (0, a().parseUpdateInfo)(p, u, l);
        return (
          null == f.releaseName &&
            (f.releaseName = s.elementValueOrEmpty("title")),
          null == f.releaseNotes &&
            (f.releaseNotes = d(
              this.updater.currentVersion,
              this.updater.fullChangelog,
              n,
              s
            )),
          f
        );
      }
      async getLatestVersionString(e) {
        const t = this.options,
          n =
            null == t.host || "github.com" === t.host
              ? (0, o().newUrlFromBase)(this.basePath + "/latest", this.baseUrl)
              : new (s().URL)(
                  this.computeGithubBasePath(
                    `/repos/${t.owner}/${t.repo}/releases`
                  ) + "/latest",
                  this.baseApiUrl
                );
        try {
          const t = await this.httpRequest(
            n,
            { Accept: "application/json" },
            e
          );
          if (null == t) return null;
          const r = JSON.parse(t);
          return r.tag_name.startsWith("v")
            ? r.tag_name.substring(1)
            : r.tag_name;
        } catch (e) {
          throw (0, r().newError)(
            `Unable to find latest version on GitHub (${n}), please ensure a production release exists: ${
              e.stack || e.message
            }`,
            "ERR_UPDATER_LATEST_VERSION_NOT_FOUND"
          );
        }
      }
      get basePath() {
        return `/${this.options.owner}/${this.options.repo}/releases`;
      }
      resolveFiles(e) {
        return (0, a().resolveFiles)(e, this.baseUrl, (t) =>
          this.getBaseDownloadPath(e.version, t.replace(/ /g, "-"))
        );
      }
      getBaseDownloadPath(e, t) {
        return `${this.basePath}/download/${
          !1 === this.options.vPrefixedTagName ? "" : "v"
        }${e}/${t}`;
      }
    };
  },
  "./node_modules/electron-updater/out/providers/PrivateGitHubProvider.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/js-yaml/index.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.PrivateGitHubProvider = void 0);
    var s = (function (e) {
      if (e && e.__esModule) return e;
      if (null === e || ("object" != typeof e && "function" != typeof e))
        return { default: e };
      var t = l();
      if (t && t.has(e)) return t.get(e);
      var n = {},
        r = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var i in e)
        if (Object.prototype.hasOwnProperty.call(e, i)) {
          var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
          s && (s.get || s.set)
            ? Object.defineProperty(n, i, s)
            : (n[i] = e[i]);
        }
      (n.default = e), t && t.set(e, n);
      return n;
    })(n("path"));
    function o() {
      const e = n("url");
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    function a() {
      const e = n(
        "./node_modules/electron-updater/out/providers/GitHubProvider.js"
      );
      return (
        (a = function () {
          return e;
        }),
        e
      );
    }
    function u() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (u = function () {
          return e;
        }),
        e
      );
    }
    function c() {
      const e = n("./node_modules/electron-updater/out/providers/Provider.js");
      return (
        (c = function () {
          return e;
        }),
        e
      );
    }
    function l() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (l = function () {
          return e;
        }),
        e
      );
    }
    class h extends a().BaseGitHubProvider {
      constructor(e, t, n, r) {
        super(e, "api.github.com", r), (this.updater = t), (this.token = n);
      }
      createRequestOptions(e, t) {
        const n = super.createRequestOptions(e, t);
        return (n.redirect = "manual"), n;
      }
      async getLatestVersion() {
        const e = new (r().CancellationToken)(),
          t = (0, u().getChannelFilename)(this.getDefaultChannelName()),
          n = await this.getLatestVersionInfo(e),
          s = n.assets.find((e) => e.name === t);
        if (null == s)
          throw (0, r().newError)(
            `Cannot find ${t} in the release ${n.html_url || n.name}`,
            "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
          );
        const a = new (o().URL)(s.url);
        let c;
        try {
          c = (0, i().safeLoad)(
            await this.httpRequest(
              a,
              this.configureHeaders("application/octet-stream"),
              e
            )
          );
        } catch (e) {
          if (e instanceof r().HttpError && 404 === e.statusCode)
            throw (0, r().newError)(
              `Cannot find ${t} in the latest release artifacts (${a}): ${
                e.stack || e.message
              }`,
              "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
            );
          throw e;
        }
        return (c.assets = n.assets), c;
      }
      get fileExtraDownloadHeaders() {
        return this.configureHeaders("application/octet-stream");
      }
      configureHeaders(e) {
        return { accept: e, authorization: "token " + this.token };
      }
      async getLatestVersionInfo(e) {
        const t = this.updater.allowPrerelease;
        let n = this.basePath;
        t || (n += "/latest");
        const i = (0, u().newUrlFromBase)(n, this.baseUrl);
        try {
          const n = JSON.parse(
            await this.httpRequest(
              i,
              this.configureHeaders("application/vnd.github.v3+json"),
              e
            )
          );
          return t ? n.find((e) => e.prerelease) || n[0] : n;
        } catch (e) {
          throw (0, r().newError)(
            `Unable to find latest version on GitHub (${i}), please ensure a production release exists: ${
              e.stack || e.message
            }`,
            "ERR_UPDATER_LATEST_VERSION_NOT_FOUND"
          );
        }
      }
      get basePath() {
        return this.computeGithubBasePath(
          `/repos/${this.options.owner}/${this.options.repo}/releases`
        );
      }
      resolveFiles(e) {
        return (0, c().getFileList)(e).map((t) => {
          const n = s.posix.basename(t.url).replace(/ /g, "-"),
            i = e.assets.find((e) => null != e && e.name === n);
          if (null == i)
            throw (0, r().newError)(
              `Cannot find asset "${n}" in: ${JSON.stringify(
                e.assets,
                null,
                2
              )}`,
              "ERR_UPDATER_ASSET_NOT_FOUND"
            );
          return { url: new (o().URL)(i.url), info: t };
        });
      }
    }
    t.PrivateGitHubProvider = h;
  },
  "./node_modules/electron-updater/out/providers/Provider.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("./node_modules/js-yaml/index.js");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = n("./node_modules/electron-updater/out/main.js");
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.findFile = function (e, t, n) {
        if (0 === e.length)
          throw (0, r().newError)(
            "No files provided",
            "ERR_UPDATER_NO_FILES_PROVIDED"
          );
        const i = e.find((e) => e.url.pathname.toLowerCase().endsWith("." + t));
        return null != i
          ? i
          : null == n
          ? e[0]
          : e.find(
              (e) =>
                !n.some((t) => e.url.pathname.toLowerCase().endsWith("." + t))
            );
      }),
      (t.parseUpdateInfo = function (e, t, n) {
        if (null == e)
          throw (0, r().newError)(
            `Cannot parse update info from ${t} in the latest release artifacts (${n}): rawData: null`,
            "ERR_UPDATER_INVALID_UPDATE_INFO"
          );
        let s;
        try {
          s = (0, i().safeLoad)(e);
        } catch (i) {
          throw (0, r().newError)(
            `Cannot parse update info from ${t} in the latest release artifacts (${n}): ${
              i.stack || i.message
            }, rawData: ${e}`,
            "ERR_UPDATER_INVALID_UPDATE_INFO"
          );
        }
        return s;
      }),
      (t.getFileList = o),
      (t.resolveFiles = function (e, t, n = (e) => e) {
        const i = o(e).map((e) => {
            if (null == e.sha2 && null == e.sha512)
              throw (0, r().newError)(
                "Update info doesn't contain nor sha256 neither sha512 checksum: " +
                  (0, r().safeStringifyJson)(e),
                "ERR_UPDATER_NO_CHECKSUM"
              );
            return { url: (0, s().newUrlFromBase)(n(e.url), t), info: e };
          }),
          a = e.packages,
          u = null == a ? null : a[process.arch] || a.ia32;
        null != u &&
          (i[0].packageInfo = {
            ...u,
            path: (0, s().newUrlFromBase)(n(u.path), t).href,
          });
        return i;
      }),
      (t.Provider = void 0);
    function o(e) {
      const t = e.files;
      if (null != t && t.length > 0) return t;
      if (null != e.path)
        return [{ url: e.path, sha2: e.sha2, sha512: e.sha512 }];
      throw (0, r().newError)(
        "No files provided: " + (0, r().safeStringifyJson)(e),
        "ERR_UPDATER_NO_FILES_PROVIDED"
      );
    }
    t.Provider = class {
      constructor(e) {
        (this.runtimeOptions = e),
          (this.requestHeaders = null),
          (this.executor = e.executor);
      }
      get isUseMultipleRangeRequest() {
        return !1 !== this.runtimeOptions.isUseMultipleRangeRequest;
      }
      getChannelFilePrefix() {
        if ("linux" === this.runtimeOptions.platform) {
          const e = process.env.TEST_UPDATER_ARCH || process.arch;
          return "-linux" + ("x64" === e ? "" : "-" + e);
        }
        return "darwin" === this.runtimeOptions.platform ? "-mac" : "";
      }
      getDefaultChannelName() {
        return this.getCustomChannelName("latest");
      }
      getCustomChannelName(e) {
        return `${e}${this.getChannelFilePrefix()}`;
      }
      get fileExtraDownloadHeaders() {
        return null;
      }
      setRequestHeaders(e) {
        this.requestHeaders = e;
      }
      httpRequest(e, t, n) {
        return this.executor.request(this.createRequestOptions(e, t), n);
      }
      createRequestOptions(e, t) {
        const n = {};
        return (
          null == this.requestHeaders
            ? null != t && (n.headers = t)
            : (n.headers =
                null == t
                  ? this.requestHeaders
                  : { ...this.requestHeaders, ...t }),
          (0, r().configureRequestUrl)(e, n),
          n
        );
      }
    };
  },
  "./node_modules/electron-updater/out/windowsExecutableCodeSignatureVerifier.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    function r() {
      const e = n("./node_modules/builder-util-runtime/out/index.js");
      return (
        (r = function () {
          return e;
        }),
        e
      );
    }
    function i() {
      const e = n("child_process");
      return (
        (i = function () {
          return e;
        }),
        e
      );
    }
    function s() {
      const e = (function (e) {
        if (e && e.__esModule) return e;
        if (null === e || ("object" != typeof e && "function" != typeof e))
          return { default: e };
        var t = o();
        if (t && t.has(e)) return t.get(e);
        var n = {},
          r = Object.defineProperty && Object.getOwnPropertyDescriptor;
        for (var i in e)
          if (Object.prototype.hasOwnProperty.call(e, i)) {
            var s = r ? Object.getOwnPropertyDescriptor(e, i) : null;
            s && (s.get || s.set)
              ? Object.defineProperty(n, i, s)
              : (n[i] = e[i]);
          }
        (n.default = e), t && t.set(e, n);
        return n;
      })(n("os"));
      return (
        (s = function () {
          return e;
        }),
        e
      );
    }
    function o() {
      if ("function" != typeof WeakMap) return null;
      var e = new WeakMap();
      return (
        (o = function () {
          return e;
        }),
        e
      );
    }
    Object.defineProperty(t, "__esModule", { value: !0 }),
      (t.verifySignature = function (e, t, n) {
        return new Promise((o) => {
          (0, i().execFile)(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-InputFormat",
              "None",
              "-Command",
              `Get-AuthenticodeSignature '${t}' | ConvertTo-Json -Compress | ForEach-Object { [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($_)) }`,
            ],
            { timeout: 2e4 },
            (t, a, u) => {
              try {
                if (null != t || u)
                  return (
                    (function (e, t, n) {
                      if (
                        (function () {
                          const e = s().release();
                          return e.startsWith("6.") && !e.startsWith("6.3");
                        })()
                      )
                        return void e.warn(
                          `Cannot execute Get-AuthenticodeSignature: ${
                            t || n
                          }. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`
                        );
                      try {
                        (0, i().execFileSync)(
                          "powershell.exe",
                          [
                            "-NoProfile",
                            "-NonInteractive",
                            "-Command",
                            "ConvertTo-Json test",
                          ],
                          { timeout: 1e4 }
                        );
                      } catch (t) {
                        return void e.warn(
                          `Cannot execute ConvertTo-Json: ${t.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`
                        );
                      }
                      if (null != t) throw t;
                      if (n)
                        e.warn(
                          `Cannot execute Get-AuthenticodeSignature, stderr: ${n}. Ignoring signature validation due to unknown stderr.`
                        );
                    })(n, t, u),
                    void o(null)
                  );
                const c = (function (e) {
                  const t = JSON.parse(e);
                  delete t.PrivateKey,
                    delete t.IsOSBinary,
                    delete t.SignatureType;
                  const n = t.SignerCertificate;
                  null != n &&
                    (delete n.Archived,
                    delete n.Extensions,
                    delete n.Handle,
                    delete n.HasPrivateKey,
                    delete n.SubjectName);
                  return delete t.Path, t;
                })(Buffer.from(a, "base64").toString("utf-8"));
                if (0 === c.Status) {
                  const t = (0, r().parseDn)(c.SignerCertificate.Subject).get(
                    "CN"
                  );
                  if (e.includes(t)) return void o(null);
                }
                const l =
                  `publisherNames: ${e.join(" | ")}, raw info: ` +
                  JSON.stringify(
                    c,
                    (e, t) => ("RawData" === e ? void 0 : t),
                    2
                  );
                n.warn(
                  "Sign verification failed, installer signed with incorrect certificate: " +
                    l
                ),
                  o(l);
              } catch (e) {
                return (
                  n.warn(
                    `Cannot execute Get-AuthenticodeSignature: ${t}. Ignoring signature validation due to unknown error.`
                  ),
                  void o(null)
                );
              }
            }
          );
        });
      });
  },
  "./node_modules/esprima/dist/esprima.js": function (e, t, n) {
    var r;
    (r = function () {
      return (function (e) {
        var t = {};
        function n(r) {
          if (t[r]) return t[r].exports;
          var i = (t[r] = { exports: {}, id: r, loaded: !1 });
          return (
            e[r].call(i.exports, i, i.exports, n), (i.loaded = !0), i.exports
          );
        }
        return (n.m = e), (n.c = t), (n.p = ""), n(0);
      })([
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(1),
            i = n(3),
            s = n(8),
            o = n(15);
          function a(e, t, n) {
            var o = null,
              a = function (e, t) {
                n && n(e, t), o && o.visit(e, t);
              },
              u = "function" == typeof n ? a : null,
              c = !1;
            if (t) {
              c = "boolean" == typeof t.comment && t.comment;
              var l = "boolean" == typeof t.attachComment && t.attachComment;
              (c || l) &&
                (((o = new r.CommentHandler()).attach = l),
                (t.comment = !0),
                (u = a));
            }
            var h,
              d = !1;
            t &&
              "string" == typeof t.sourceType &&
              (d = "module" === t.sourceType),
              (h =
                t && "boolean" == typeof t.jsx && t.jsx
                  ? new i.JSXParser(e, t, u)
                  : new s.Parser(e, t, u));
            var p = d ? h.parseModule() : h.parseScript();
            return (
              c && o && (p.comments = o.comments),
              h.config.tokens && (p.tokens = h.tokens),
              h.config.tolerant && (p.errors = h.errorHandler.errors),
              p
            );
          }
          (t.parse = a),
            (t.parseModule = function (e, t, n) {
              var r = t || {};
              return (r.sourceType = "module"), a(e, r, n);
            }),
            (t.parseScript = function (e, t, n) {
              var r = t || {};
              return (r.sourceType = "script"), a(e, r, n);
            }),
            (t.tokenize = function (e, t, n) {
              var r,
                i = new o.Tokenizer(e, t);
              r = [];
              try {
                for (;;) {
                  var s = i.getNextToken();
                  if (!s) break;
                  n && (s = n(s)), r.push(s);
                }
              } catch (e) {
                i.errorHandler.tolerate(e);
              }
              return i.errorHandler.tolerant && (r.errors = i.errors()), r;
            });
          var u = n(2);
          (t.Syntax = u.Syntax), (t.version = "4.0.1");
        },
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(2),
            i = (function () {
              function e() {
                (this.attach = !1),
                  (this.comments = []),
                  (this.stack = []),
                  (this.leading = []),
                  (this.trailing = []);
              }
              return (
                (e.prototype.insertInnerComments = function (e, t) {
                  if (
                    e.type === r.Syntax.BlockStatement &&
                    0 === e.body.length
                  ) {
                    for (var n = [], i = this.leading.length - 1; i >= 0; --i) {
                      var s = this.leading[i];
                      t.end.offset >= s.start &&
                        (n.unshift(s.comment),
                        this.leading.splice(i, 1),
                        this.trailing.splice(i, 1));
                    }
                    n.length && (e.innerComments = n);
                  }
                }),
                (e.prototype.findTrailingComments = function (e) {
                  var t = [];
                  if (this.trailing.length > 0) {
                    for (var n = this.trailing.length - 1; n >= 0; --n) {
                      var r = this.trailing[n];
                      r.start >= e.end.offset && t.unshift(r.comment);
                    }
                    return (this.trailing.length = 0), t;
                  }
                  var i = this.stack[this.stack.length - 1];
                  if (i && i.node.trailingComments) {
                    var s = i.node.trailingComments[0];
                    s &&
                      s.range[0] >= e.end.offset &&
                      ((t = i.node.trailingComments),
                      delete i.node.trailingComments);
                  }
                  return t;
                }),
                (e.prototype.findLeadingComments = function (e) {
                  for (
                    var t, n = [];
                    this.stack.length > 0 &&
                    (s = this.stack[this.stack.length - 1]) &&
                    s.start >= e.start.offset;

                  )
                    (t = s.node), this.stack.pop();
                  if (t) {
                    for (
                      var r =
                        (t.leadingComments ? t.leadingComments.length : 0) - 1;
                      r >= 0;
                      --r
                    ) {
                      var i = t.leadingComments[r];
                      i.range[1] <= e.start.offset &&
                        (n.unshift(i), t.leadingComments.splice(r, 1));
                    }
                    return (
                      t.leadingComments &&
                        0 === t.leadingComments.length &&
                        delete t.leadingComments,
                      n
                    );
                  }
                  for (r = this.leading.length - 1; r >= 0; --r) {
                    var s;
                    (s = this.leading[r]).start <= e.start.offset &&
                      (n.unshift(s.comment), this.leading.splice(r, 1));
                  }
                  return n;
                }),
                (e.prototype.visitNode = function (e, t) {
                  if (!(e.type === r.Syntax.Program && e.body.length > 0)) {
                    this.insertInnerComments(e, t);
                    var n = this.findTrailingComments(t),
                      i = this.findLeadingComments(t);
                    i.length > 0 && (e.leadingComments = i),
                      n.length > 0 && (e.trailingComments = n),
                      this.stack.push({ node: e, start: t.start.offset });
                  }
                }),
                (e.prototype.visitComment = function (e, t) {
                  var n = "L" === e.type[0] ? "Line" : "Block",
                    r = { type: n, value: e.value };
                  if (
                    (e.range && (r.range = e.range),
                    e.loc && (r.loc = e.loc),
                    this.comments.push(r),
                    this.attach)
                  ) {
                    var i = {
                      comment: {
                        type: n,
                        value: e.value,
                        range: [t.start.offset, t.end.offset],
                      },
                      start: t.start.offset,
                    };
                    e.loc && (i.comment.loc = e.loc),
                      (e.type = n),
                      this.leading.push(i),
                      this.trailing.push(i);
                  }
                }),
                (e.prototype.visit = function (e, t) {
                  "LineComment" === e.type || "BlockComment" === e.type
                    ? this.visitComment(e, t)
                    : this.attach && this.visitNode(e, t);
                }),
                e
              );
            })();
          t.CommentHandler = i;
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 }),
            (t.Syntax = {
              AssignmentExpression: "AssignmentExpression",
              AssignmentPattern: "AssignmentPattern",
              ArrayExpression: "ArrayExpression",
              ArrayPattern: "ArrayPattern",
              ArrowFunctionExpression: "ArrowFunctionExpression",
              AwaitExpression: "AwaitExpression",
              BlockStatement: "BlockStatement",
              BinaryExpression: "BinaryExpression",
              BreakStatement: "BreakStatement",
              CallExpression: "CallExpression",
              CatchClause: "CatchClause",
              ClassBody: "ClassBody",
              ClassDeclaration: "ClassDeclaration",
              ClassExpression: "ClassExpression",
              ConditionalExpression: "ConditionalExpression",
              ContinueStatement: "ContinueStatement",
              DoWhileStatement: "DoWhileStatement",
              DebuggerStatement: "DebuggerStatement",
              EmptyStatement: "EmptyStatement",
              ExportAllDeclaration: "ExportAllDeclaration",
              ExportDefaultDeclaration: "ExportDefaultDeclaration",
              ExportNamedDeclaration: "ExportNamedDeclaration",
              ExportSpecifier: "ExportSpecifier",
              ExpressionStatement: "ExpressionStatement",
              ForStatement: "ForStatement",
              ForOfStatement: "ForOfStatement",
              ForInStatement: "ForInStatement",
              FunctionDeclaration: "FunctionDeclaration",
              FunctionExpression: "FunctionExpression",
              Identifier: "Identifier",
              IfStatement: "IfStatement",
              ImportDeclaration: "ImportDeclaration",
              ImportDefaultSpecifier: "ImportDefaultSpecifier",
              ImportNamespaceSpecifier: "ImportNamespaceSpecifier",
              ImportSpecifier: "ImportSpecifier",
              Literal: "Literal",
              LabeledStatement: "LabeledStatement",
              LogicalExpression: "LogicalExpression",
              MemberExpression: "MemberExpression",
              MetaProperty: "MetaProperty",
              MethodDefinition: "MethodDefinition",
              NewExpression: "NewExpression",
              ObjectExpression: "ObjectExpression",
              ObjectPattern: "ObjectPattern",
              Program: "Program",
              Property: "Property",
              RestElement: "RestElement",
              ReturnStatement: "ReturnStatement",
              SequenceExpression: "SequenceExpression",
              SpreadElement: "SpreadElement",
              Super: "Super",
              SwitchCase: "SwitchCase",
              SwitchStatement: "SwitchStatement",
              TaggedTemplateExpression: "TaggedTemplateExpression",
              TemplateElement: "TemplateElement",
              TemplateLiteral: "TemplateLiteral",
              ThisExpression: "ThisExpression",
              ThrowStatement: "ThrowStatement",
              TryStatement: "TryStatement",
              UnaryExpression: "UnaryExpression",
              UpdateExpression: "UpdateExpression",
              VariableDeclaration: "VariableDeclaration",
              VariableDeclarator: "VariableDeclarator",
              WhileStatement: "WhileStatement",
              WithStatement: "WithStatement",
              YieldExpression: "YieldExpression",
            });
        },
        function (e, t, n) {
          "use strict";
          var r,
            i =
              (this && this.__extends) ||
              ((r =
                Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array &&
                  function (e, t) {
                    e.__proto__ = t;
                  }) ||
                function (e, t) {
                  for (var n in t) t.hasOwnProperty(n) && (e[n] = t[n]);
                }),
              function (e, t) {
                function n() {
                  this.constructor = e;
                }
                r(e, t),
                  (e.prototype =
                    null === t
                      ? Object.create(t)
                      : ((n.prototype = t.prototype), new n()));
              });
          Object.defineProperty(t, "__esModule", { value: !0 });
          var s = n(4),
            o = n(5),
            a = n(6),
            u = n(7),
            c = n(8),
            l = n(13),
            h = n(14);
          function d(e) {
            var t;
            switch (e.type) {
              case a.JSXSyntax.JSXIdentifier:
                t = e.name;
                break;
              case a.JSXSyntax.JSXNamespacedName:
                var n = e;
                t = d(n.namespace) + ":" + d(n.name);
                break;
              case a.JSXSyntax.JSXMemberExpression:
                var r = e;
                t = d(r.object) + "." + d(r.property);
            }
            return t;
          }
          (l.TokenName[100] = "JSXIdentifier"), (l.TokenName[101] = "JSXText");
          var p = (function (e) {
            function t(t, n, r) {
              return e.call(this, t, n, r) || this;
            }
            return (
              i(t, e),
              (t.prototype.parsePrimaryExpression = function () {
                return this.match("<")
                  ? this.parseJSXRoot()
                  : e.prototype.parsePrimaryExpression.call(this);
              }),
              (t.prototype.startJSX = function () {
                (this.scanner.index = this.startMarker.index),
                  (this.scanner.lineNumber = this.startMarker.line),
                  (this.scanner.lineStart =
                    this.startMarker.index - this.startMarker.column);
              }),
              (t.prototype.finishJSX = function () {
                this.nextToken();
              }),
              (t.prototype.reenterJSX = function () {
                this.startJSX(),
                  this.expectJSX("}"),
                  this.config.tokens && this.tokens.pop();
              }),
              (t.prototype.createJSXNode = function () {
                return (
                  this.collectComments(),
                  {
                    index: this.scanner.index,
                    line: this.scanner.lineNumber,
                    column: this.scanner.index - this.scanner.lineStart,
                  }
                );
              }),
              (t.prototype.createJSXChildNode = function () {
                return {
                  index: this.scanner.index,
                  line: this.scanner.lineNumber,
                  column: this.scanner.index - this.scanner.lineStart,
                };
              }),
              (t.prototype.scanXHTMLEntity = function (e) {
                for (
                  var t = "&", n = !0, r = !1, i = !1, o = !1;
                  !this.scanner.eof() && n && !r;

                ) {
                  var a = this.scanner.source[this.scanner.index];
                  if (a === e) break;
                  if (((r = ";" === a), (t += a), ++this.scanner.index, !r))
                    switch (t.length) {
                      case 2:
                        i = "#" === a;
                        break;
                      case 3:
                        i &&
                          ((n =
                            (o = "x" === a) ||
                            s.Character.isDecimalDigit(a.charCodeAt(0))),
                          (i = i && !o));
                        break;
                      default:
                        n =
                          (n =
                            n &&
                            !(
                              i && !s.Character.isDecimalDigit(a.charCodeAt(0))
                            )) &&
                          !(o && !s.Character.isHexDigit(a.charCodeAt(0)));
                    }
                }
                if (n && r && t.length > 2) {
                  var u = t.substr(1, t.length - 2);
                  i && u.length > 1
                    ? (t = String.fromCharCode(parseInt(u.substr(1), 10)))
                    : o && u.length > 2
                    ? (t = String.fromCharCode(parseInt("0" + u.substr(1), 16)))
                    : i || o || !h.XHTMLEntities[u] || (t = h.XHTMLEntities[u]);
                }
                return t;
              }),
              (t.prototype.lexJSX = function () {
                var e = this.scanner.source.charCodeAt(this.scanner.index);
                if (
                  60 === e ||
                  62 === e ||
                  47 === e ||
                  58 === e ||
                  61 === e ||
                  123 === e ||
                  125 === e
                )
                  return {
                    type: 7,
                    value: (a = this.scanner.source[this.scanner.index++]),
                    lineNumber: this.scanner.lineNumber,
                    lineStart: this.scanner.lineStart,
                    start: this.scanner.index - 1,
                    end: this.scanner.index,
                  };
                if (34 === e || 39 === e) {
                  for (
                    var t = this.scanner.index,
                      n = this.scanner.source[this.scanner.index++],
                      r = "";
                    !this.scanner.eof() &&
                    (u = this.scanner.source[this.scanner.index++]) !== n;

                  )
                    r += "&" === u ? this.scanXHTMLEntity(n) : u;
                  return {
                    type: 8,
                    value: r,
                    lineNumber: this.scanner.lineNumber,
                    lineStart: this.scanner.lineStart,
                    start: t,
                    end: this.scanner.index,
                  };
                }
                if (46 === e) {
                  var i = this.scanner.source.charCodeAt(
                      this.scanner.index + 1
                    ),
                    o = this.scanner.source.charCodeAt(this.scanner.index + 2),
                    a = 46 === i && 46 === o ? "..." : ".";
                  return (
                    (t = this.scanner.index),
                    (this.scanner.index += a.length),
                    {
                      type: 7,
                      value: a,
                      lineNumber: this.scanner.lineNumber,
                      lineStart: this.scanner.lineStart,
                      start: t,
                      end: this.scanner.index,
                    }
                  );
                }
                if (96 === e)
                  return {
                    type: 10,
                    value: "",
                    lineNumber: this.scanner.lineNumber,
                    lineStart: this.scanner.lineStart,
                    start: this.scanner.index,
                    end: this.scanner.index,
                  };
                if (s.Character.isIdentifierStart(e) && 92 !== e) {
                  for (
                    t = this.scanner.index, ++this.scanner.index;
                    !this.scanner.eof();

                  ) {
                    var u = this.scanner.source.charCodeAt(this.scanner.index);
                    if (s.Character.isIdentifierPart(u) && 92 !== u)
                      ++this.scanner.index;
                    else {
                      if (45 !== u) break;
                      ++this.scanner.index;
                    }
                  }
                  return {
                    type: 100,
                    value: this.scanner.source.slice(t, this.scanner.index),
                    lineNumber: this.scanner.lineNumber,
                    lineStart: this.scanner.lineStart,
                    start: t,
                    end: this.scanner.index,
                  };
                }
                return this.scanner.lex();
              }),
              (t.prototype.nextJSXToken = function () {
                this.collectComments(),
                  (this.startMarker.index = this.scanner.index),
                  (this.startMarker.line = this.scanner.lineNumber),
                  (this.startMarker.column =
                    this.scanner.index - this.scanner.lineStart);
                var e = this.lexJSX();
                return (
                  (this.lastMarker.index = this.scanner.index),
                  (this.lastMarker.line = this.scanner.lineNumber),
                  (this.lastMarker.column =
                    this.scanner.index - this.scanner.lineStart),
                  this.config.tokens && this.tokens.push(this.convertToken(e)),
                  e
                );
              }),
              (t.prototype.nextJSXText = function () {
                (this.startMarker.index = this.scanner.index),
                  (this.startMarker.line = this.scanner.lineNumber),
                  (this.startMarker.column =
                    this.scanner.index - this.scanner.lineStart);
                for (
                  var e = this.scanner.index, t = "";
                  !this.scanner.eof();

                ) {
                  var n = this.scanner.source[this.scanner.index];
                  if ("{" === n || "<" === n) break;
                  ++this.scanner.index,
                    (t += n),
                    s.Character.isLineTerminator(n.charCodeAt(0)) &&
                      (++this.scanner.lineNumber,
                      "\r" === n &&
                        "\n" === this.scanner.source[this.scanner.index] &&
                        ++this.scanner.index,
                      (this.scanner.lineStart = this.scanner.index));
                }
                (this.lastMarker.index = this.scanner.index),
                  (this.lastMarker.line = this.scanner.lineNumber),
                  (this.lastMarker.column =
                    this.scanner.index - this.scanner.lineStart);
                var r = {
                  type: 101,
                  value: t,
                  lineNumber: this.scanner.lineNumber,
                  lineStart: this.scanner.lineStart,
                  start: e,
                  end: this.scanner.index,
                };
                return (
                  t.length > 0 &&
                    this.config.tokens &&
                    this.tokens.push(this.convertToken(r)),
                  r
                );
              }),
              (t.prototype.peekJSXToken = function () {
                var e = this.scanner.saveState();
                this.scanner.scanComments();
                var t = this.lexJSX();
                return this.scanner.restoreState(e), t;
              }),
              (t.prototype.expectJSX = function (e) {
                var t = this.nextJSXToken();
                (7 === t.type && t.value === e) || this.throwUnexpectedToken(t);
              }),
              (t.prototype.matchJSX = function (e) {
                var t = this.peekJSXToken();
                return 7 === t.type && t.value === e;
              }),
              (t.prototype.parseJSXIdentifier = function () {
                var e = this.createJSXNode(),
                  t = this.nextJSXToken();
                return (
                  100 !== t.type && this.throwUnexpectedToken(t),
                  this.finalize(e, new o.JSXIdentifier(t.value))
                );
              }),
              (t.prototype.parseJSXElementName = function () {
                var e = this.createJSXNode(),
                  t = this.parseJSXIdentifier();
                if (this.matchJSX(":")) {
                  var n = t;
                  this.expectJSX(":");
                  var r = this.parseJSXIdentifier();
                  t = this.finalize(e, new o.JSXNamespacedName(n, r));
                } else if (this.matchJSX("."))
                  for (; this.matchJSX("."); ) {
                    var i = t;
                    this.expectJSX(".");
                    var s = this.parseJSXIdentifier();
                    t = this.finalize(e, new o.JSXMemberExpression(i, s));
                  }
                return t;
              }),
              (t.prototype.parseJSXAttributeName = function () {
                var e,
                  t = this.createJSXNode(),
                  n = this.parseJSXIdentifier();
                if (this.matchJSX(":")) {
                  var r = n;
                  this.expectJSX(":");
                  var i = this.parseJSXIdentifier();
                  e = this.finalize(t, new o.JSXNamespacedName(r, i));
                } else e = n;
                return e;
              }),
              (t.prototype.parseJSXStringLiteralAttribute = function () {
                var e = this.createJSXNode(),
                  t = this.nextJSXToken();
                8 !== t.type && this.throwUnexpectedToken(t);
                var n = this.getTokenRaw(t);
                return this.finalize(e, new u.Literal(t.value, n));
              }),
              (t.prototype.parseJSXExpressionAttribute = function () {
                var e = this.createJSXNode();
                this.expectJSX("{"),
                  this.finishJSX(),
                  this.match("}") &&
                    this.tolerateError(
                      "JSX attributes must only be assigned a non-empty expression"
                    );
                var t = this.parseAssignmentExpression();
                return (
                  this.reenterJSX(),
                  this.finalize(e, new o.JSXExpressionContainer(t))
                );
              }),
              (t.prototype.parseJSXAttributeValue = function () {
                return this.matchJSX("{")
                  ? this.parseJSXExpressionAttribute()
                  : this.matchJSX("<")
                  ? this.parseJSXElement()
                  : this.parseJSXStringLiteralAttribute();
              }),
              (t.prototype.parseJSXNameValueAttribute = function () {
                var e = this.createJSXNode(),
                  t = this.parseJSXAttributeName(),
                  n = null;
                return (
                  this.matchJSX("=") &&
                    (this.expectJSX("="), (n = this.parseJSXAttributeValue())),
                  this.finalize(e, new o.JSXAttribute(t, n))
                );
              }),
              (t.prototype.parseJSXSpreadAttribute = function () {
                var e = this.createJSXNode();
                this.expectJSX("{"), this.expectJSX("..."), this.finishJSX();
                var t = this.parseAssignmentExpression();
                return (
                  this.reenterJSX(),
                  this.finalize(e, new o.JSXSpreadAttribute(t))
                );
              }),
              (t.prototype.parseJSXAttributes = function () {
                for (var e = []; !this.matchJSX("/") && !this.matchJSX(">"); ) {
                  var t = this.matchJSX("{")
                    ? this.parseJSXSpreadAttribute()
                    : this.parseJSXNameValueAttribute();
                  e.push(t);
                }
                return e;
              }),
              (t.prototype.parseJSXOpeningElement = function () {
                var e = this.createJSXNode();
                this.expectJSX("<");
                var t = this.parseJSXElementName(),
                  n = this.parseJSXAttributes(),
                  r = this.matchJSX("/");
                return (
                  r && this.expectJSX("/"),
                  this.expectJSX(">"),
                  this.finalize(e, new o.JSXOpeningElement(t, r, n))
                );
              }),
              (t.prototype.parseJSXBoundaryElement = function () {
                var e = this.createJSXNode();
                if ((this.expectJSX("<"), this.matchJSX("/"))) {
                  this.expectJSX("/");
                  var t = this.parseJSXElementName();
                  return (
                    this.expectJSX(">"),
                    this.finalize(e, new o.JSXClosingElement(t))
                  );
                }
                var n = this.parseJSXElementName(),
                  r = this.parseJSXAttributes(),
                  i = this.matchJSX("/");
                return (
                  i && this.expectJSX("/"),
                  this.expectJSX(">"),
                  this.finalize(e, new o.JSXOpeningElement(n, i, r))
                );
              }),
              (t.prototype.parseJSXEmptyExpression = function () {
                var e = this.createJSXChildNode();
                return (
                  this.collectComments(),
                  (this.lastMarker.index = this.scanner.index),
                  (this.lastMarker.line = this.scanner.lineNumber),
                  (this.lastMarker.column =
                    this.scanner.index - this.scanner.lineStart),
                  this.finalize(e, new o.JSXEmptyExpression())
                );
              }),
              (t.prototype.parseJSXExpressionContainer = function () {
                var e,
                  t = this.createJSXNode();
                return (
                  this.expectJSX("{"),
                  this.matchJSX("}")
                    ? ((e = this.parseJSXEmptyExpression()),
                      this.expectJSX("}"))
                    : (this.finishJSX(),
                      (e = this.parseAssignmentExpression()),
                      this.reenterJSX()),
                  this.finalize(t, new o.JSXExpressionContainer(e))
                );
              }),
              (t.prototype.parseJSXChildren = function () {
                for (var e = []; !this.scanner.eof(); ) {
                  var t = this.createJSXChildNode(),
                    n = this.nextJSXText();
                  if (n.start < n.end) {
                    var r = this.getTokenRaw(n),
                      i = this.finalize(t, new o.JSXText(n.value, r));
                    e.push(i);
                  }
                  if ("{" !== this.scanner.source[this.scanner.index]) break;
                  var s = this.parseJSXExpressionContainer();
                  e.push(s);
                }
                return e;
              }),
              (t.prototype.parseComplexJSXElement = function (e) {
                for (var t = []; !this.scanner.eof(); ) {
                  e.children = e.children.concat(this.parseJSXChildren());
                  var n = this.createJSXChildNode(),
                    r = this.parseJSXBoundaryElement();
                  if (r.type === a.JSXSyntax.JSXOpeningElement) {
                    var i = r;
                    if (i.selfClosing) {
                      var s = this.finalize(n, new o.JSXElement(i, [], null));
                      e.children.push(s);
                    } else
                      t.push(e),
                        (e = {
                          node: n,
                          opening: i,
                          closing: null,
                          children: [],
                        });
                  }
                  if (r.type === a.JSXSyntax.JSXClosingElement) {
                    e.closing = r;
                    var u = d(e.opening.name);
                    if (
                      (u !== d(e.closing.name) &&
                        this.tolerateError(
                          "Expected corresponding JSX closing tag for %0",
                          u
                        ),
                      !(t.length > 0))
                    )
                      break;
                    (s = this.finalize(
                      e.node,
                      new o.JSXElement(e.opening, e.children, e.closing)
                    )),
                      (e = t[t.length - 1]).children.push(s),
                      t.pop();
                  }
                }
                return e;
              }),
              (t.prototype.parseJSXElement = function () {
                var e = this.createJSXNode(),
                  t = this.parseJSXOpeningElement(),
                  n = [],
                  r = null;
                if (!t.selfClosing) {
                  var i = this.parseComplexJSXElement({
                    node: e,
                    opening: t,
                    closing: r,
                    children: n,
                  });
                  (n = i.children), (r = i.closing);
                }
                return this.finalize(e, new o.JSXElement(t, n, r));
              }),
              (t.prototype.parseJSXRoot = function () {
                this.config.tokens && this.tokens.pop(), this.startJSX();
                var e = this.parseJSXElement();
                return this.finishJSX(), e;
              }),
              (t.prototype.isStartOfExpression = function () {
                return (
                  e.prototype.isStartOfExpression.call(this) || this.match("<")
                );
              }),
              t
            );
          })(c.Parser);
          t.JSXParser = p;
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var n = {
            NonAsciiIdentifierStart: /[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D]/,
            NonAsciiIdentifierPart: /[\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B4\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF]/,
          };
          t.Character = {
            fromCodePoint: function (e) {
              return e < 65536
                ? String.fromCharCode(e)
                : String.fromCharCode(55296 + ((e - 65536) >> 10)) +
                    String.fromCharCode(56320 + ((e - 65536) & 1023));
            },
            isWhiteSpace: function (e) {
              return (
                32 === e ||
                9 === e ||
                11 === e ||
                12 === e ||
                160 === e ||
                (e >= 5760 &&
                  [
                    5760,
                    8192,
                    8193,
                    8194,
                    8195,
                    8196,
                    8197,
                    8198,
                    8199,
                    8200,
                    8201,
                    8202,
                    8239,
                    8287,
                    12288,
                    65279,
                  ].indexOf(e) >= 0)
              );
            },
            isLineTerminator: function (e) {
              return 10 === e || 13 === e || 8232 === e || 8233 === e;
            },
            isIdentifierStart: function (e) {
              return (
                36 === e ||
                95 === e ||
                (e >= 65 && e <= 90) ||
                (e >= 97 && e <= 122) ||
                92 === e ||
                (e >= 128 &&
                  n.NonAsciiIdentifierStart.test(t.Character.fromCodePoint(e)))
              );
            },
            isIdentifierPart: function (e) {
              return (
                36 === e ||
                95 === e ||
                (e >= 65 && e <= 90) ||
                (e >= 97 && e <= 122) ||
                (e >= 48 && e <= 57) ||
                92 === e ||
                (e >= 128 &&
                  n.NonAsciiIdentifierPart.test(t.Character.fromCodePoint(e)))
              );
            },
            isDecimalDigit: function (e) {
              return e >= 48 && e <= 57;
            },
            isHexDigit: function (e) {
              return (
                (e >= 48 && e <= 57) ||
                (e >= 65 && e <= 70) ||
                (e >= 97 && e <= 102)
              );
            },
            isOctalDigit: function (e) {
              return e >= 48 && e <= 55;
            },
          };
        },
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(6),
            i = function (e) {
              (this.type = r.JSXSyntax.JSXClosingElement), (this.name = e);
            };
          t.JSXClosingElement = i;
          var s = function (e, t, n) {
            (this.type = r.JSXSyntax.JSXElement),
              (this.openingElement = e),
              (this.children = t),
              (this.closingElement = n);
          };
          t.JSXElement = s;
          var o = function () {
            this.type = r.JSXSyntax.JSXEmptyExpression;
          };
          t.JSXEmptyExpression = o;
          var a = function (e) {
            (this.type = r.JSXSyntax.JSXExpressionContainer),
              (this.expression = e);
          };
          t.JSXExpressionContainer = a;
          var u = function (e) {
            (this.type = r.JSXSyntax.JSXIdentifier), (this.name = e);
          };
          t.JSXIdentifier = u;
          var c = function (e, t) {
            (this.type = r.JSXSyntax.JSXMemberExpression),
              (this.object = e),
              (this.property = t);
          };
          t.JSXMemberExpression = c;
          var l = function (e, t) {
            (this.type = r.JSXSyntax.JSXAttribute),
              (this.name = e),
              (this.value = t);
          };
          t.JSXAttribute = l;
          var h = function (e, t) {
            (this.type = r.JSXSyntax.JSXNamespacedName),
              (this.namespace = e),
              (this.name = t);
          };
          t.JSXNamespacedName = h;
          var d = function (e, t, n) {
            (this.type = r.JSXSyntax.JSXOpeningElement),
              (this.name = e),
              (this.selfClosing = t),
              (this.attributes = n);
          };
          t.JSXOpeningElement = d;
          var p = function (e) {
            (this.type = r.JSXSyntax.JSXSpreadAttribute), (this.argument = e);
          };
          t.JSXSpreadAttribute = p;
          var f = function (e, t) {
            (this.type = r.JSXSyntax.JSXText), (this.value = e), (this.raw = t);
          };
          t.JSXText = f;
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 }),
            (t.JSXSyntax = {
              JSXAttribute: "JSXAttribute",
              JSXClosingElement: "JSXClosingElement",
              JSXElement: "JSXElement",
              JSXEmptyExpression: "JSXEmptyExpression",
              JSXExpressionContainer: "JSXExpressionContainer",
              JSXIdentifier: "JSXIdentifier",
              JSXMemberExpression: "JSXMemberExpression",
              JSXNamespacedName: "JSXNamespacedName",
              JSXOpeningElement: "JSXOpeningElement",
              JSXSpreadAttribute: "JSXSpreadAttribute",
              JSXText: "JSXText",
            });
        },
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(2),
            i = function (e) {
              (this.type = r.Syntax.ArrayExpression), (this.elements = e);
            };
          t.ArrayExpression = i;
          var s = function (e) {
            (this.type = r.Syntax.ArrayPattern), (this.elements = e);
          };
          t.ArrayPattern = s;
          var o = function (e, t, n) {
            (this.type = r.Syntax.ArrowFunctionExpression),
              (this.id = null),
              (this.params = e),
              (this.body = t),
              (this.generator = !1),
              (this.expression = n),
              (this.async = !1);
          };
          t.ArrowFunctionExpression = o;
          var a = function (e, t, n) {
            (this.type = r.Syntax.AssignmentExpression),
              (this.operator = e),
              (this.left = t),
              (this.right = n);
          };
          t.AssignmentExpression = a;
          var u = function (e, t) {
            (this.type = r.Syntax.AssignmentPattern),
              (this.left = e),
              (this.right = t);
          };
          t.AssignmentPattern = u;
          var c = function (e, t, n) {
            (this.type = r.Syntax.ArrowFunctionExpression),
              (this.id = null),
              (this.params = e),
              (this.body = t),
              (this.generator = !1),
              (this.expression = n),
              (this.async = !0);
          };
          t.AsyncArrowFunctionExpression = c;
          var l = function (e, t, n) {
            (this.type = r.Syntax.FunctionDeclaration),
              (this.id = e),
              (this.params = t),
              (this.body = n),
              (this.generator = !1),
              (this.expression = !1),
              (this.async = !0);
          };
          t.AsyncFunctionDeclaration = l;
          var h = function (e, t, n) {
            (this.type = r.Syntax.FunctionExpression),
              (this.id = e),
              (this.params = t),
              (this.body = n),
              (this.generator = !1),
              (this.expression = !1),
              (this.async = !0);
          };
          t.AsyncFunctionExpression = h;
          var d = function (e) {
            (this.type = r.Syntax.AwaitExpression), (this.argument = e);
          };
          t.AwaitExpression = d;
          var p = function (e, t, n) {
            var i = "||" === e || "&&" === e;
            (this.type = i
              ? r.Syntax.LogicalExpression
              : r.Syntax.BinaryExpression),
              (this.operator = e),
              (this.left = t),
              (this.right = n);
          };
          t.BinaryExpression = p;
          var f = function (e) {
            (this.type = r.Syntax.BlockStatement), (this.body = e);
          };
          t.BlockStatement = f;
          var m = function (e) {
            (this.type = r.Syntax.BreakStatement), (this.label = e);
          };
          t.BreakStatement = m;
          var g = function (e, t) {
            (this.type = r.Syntax.CallExpression),
              (this.callee = e),
              (this.arguments = t);
          };
          t.CallExpression = g;
          var y = function (e, t) {
            (this.type = r.Syntax.CatchClause),
              (this.param = e),
              (this.body = t);
          };
          t.CatchClause = y;
          var v = function (e) {
            (this.type = r.Syntax.ClassBody), (this.body = e);
          };
          t.ClassBody = v;
          var E = function (e, t, n) {
            (this.type = r.Syntax.ClassDeclaration),
              (this.id = e),
              (this.superClass = t),
              (this.body = n);
          };
          t.ClassDeclaration = E;
          var x = function (e, t, n) {
            (this.type = r.Syntax.ClassExpression),
              (this.id = e),
              (this.superClass = t),
              (this.body = n);
          };
          t.ClassExpression = x;
          var b = function (e, t) {
            (this.type = r.Syntax.MemberExpression),
              (this.computed = !0),
              (this.object = e),
              (this.property = t);
          };
          t.ComputedMemberExpression = b;
          var D = function (e, t, n) {
            (this.type = r.Syntax.ConditionalExpression),
              (this.test = e),
              (this.consequent = t),
              (this.alternate = n);
          };
          t.ConditionalExpression = D;
          var w = function (e) {
            (this.type = r.Syntax.ContinueStatement), (this.label = e);
          };
          t.ContinueStatement = w;
          var _ = function () {
            this.type = r.Syntax.DebuggerStatement;
          };
          t.DebuggerStatement = _;
          var C = function (e, t) {
            (this.type = r.Syntax.ExpressionStatement),
              (this.expression = e),
              (this.directive = t);
          };
          t.Directive = C;
          var S = function (e, t) {
            (this.type = r.Syntax.DoWhileStatement),
              (this.body = e),
              (this.test = t);
          };
          t.DoWhileStatement = S;
          var A = function () {
            this.type = r.Syntax.EmptyStatement;
          };
          t.EmptyStatement = A;
          var j = function (e) {
            (this.type = r.Syntax.ExportAllDeclaration), (this.source = e);
          };
          t.ExportAllDeclaration = j;
          var F = function (e) {
            (this.type = r.Syntax.ExportDefaultDeclaration),
              (this.declaration = e);
          };
          t.ExportDefaultDeclaration = F;
          var k = function (e, t, n) {
            (this.type = r.Syntax.ExportNamedDeclaration),
              (this.declaration = e),
              (this.specifiers = t),
              (this.source = n);
          };
          t.ExportNamedDeclaration = k;
          var T = function (e, t) {
            (this.type = r.Syntax.ExportSpecifier),
              (this.exported = t),
              (this.local = e);
          };
          t.ExportSpecifier = T;
          var O = function (e) {
            (this.type = r.Syntax.ExpressionStatement), (this.expression = e);
          };
          t.ExpressionStatement = O;
          var N = function (e, t, n) {
            (this.type = r.Syntax.ForInStatement),
              (this.left = e),
              (this.right = t),
              (this.body = n),
              (this.each = !1);
          };
          t.ForInStatement = N;
          var I = function (e, t, n) {
            (this.type = r.Syntax.ForOfStatement),
              (this.left = e),
              (this.right = t),
              (this.body = n);
          };
          t.ForOfStatement = I;
          var P = function (e, t, n, i) {
            (this.type = r.Syntax.ForStatement),
              (this.init = e),
              (this.test = t),
              (this.update = n),
              (this.body = i);
          };
          t.ForStatement = P;
          var R = function (e, t, n, i) {
            (this.type = r.Syntax.FunctionDeclaration),
              (this.id = e),
              (this.params = t),
              (this.body = n),
              (this.generator = i),
              (this.expression = !1),
              (this.async = !1);
          };
          t.FunctionDeclaration = R;
          var L = function (e, t, n, i) {
            (this.type = r.Syntax.FunctionExpression),
              (this.id = e),
              (this.params = t),
              (this.body = n),
              (this.generator = i),
              (this.expression = !1),
              (this.async = !1);
          };
          t.FunctionExpression = L;
          var M = function (e) {
            (this.type = r.Syntax.Identifier), (this.name = e);
          };
          t.Identifier = M;
          var B = function (e, t, n) {
            (this.type = r.Syntax.IfStatement),
              (this.test = e),
              (this.consequent = t),
              (this.alternate = n);
          };
          t.IfStatement = B;
          var U = function (e, t) {
            (this.type = r.Syntax.ImportDeclaration),
              (this.specifiers = e),
              (this.source = t);
          };
          t.ImportDeclaration = U;
          var $ = function (e) {
            (this.type = r.Syntax.ImportDefaultSpecifier), (this.local = e);
          };
          t.ImportDefaultSpecifier = $;
          var G = function (e) {
            (this.type = r.Syntax.ImportNamespaceSpecifier), (this.local = e);
          };
          t.ImportNamespaceSpecifier = G;
          var z = function (e, t) {
            (this.type = r.Syntax.ImportSpecifier),
              (this.local = e),
              (this.imported = t);
          };
          t.ImportSpecifier = z;
          var q = function (e, t) {
            (this.type = r.Syntax.LabeledStatement),
              (this.label = e),
              (this.body = t);
          };
          t.LabeledStatement = q;
          var H = function (e, t) {
            (this.type = r.Syntax.Literal), (this.value = e), (this.raw = t);
          };
          t.Literal = H;
          var X = function (e, t) {
            (this.type = r.Syntax.MetaProperty),
              (this.meta = e),
              (this.property = t);
          };
          t.MetaProperty = X;
          var J = function (e, t, n, i, s) {
            (this.type = r.Syntax.MethodDefinition),
              (this.key = e),
              (this.computed = t),
              (this.value = n),
              (this.kind = i),
              (this.static = s);
          };
          t.MethodDefinition = J;
          var W = function (e) {
            (this.type = r.Syntax.Program),
              (this.body = e),
              (this.sourceType = "module");
          };
          t.Module = W;
          var V = function (e, t) {
            (this.type = r.Syntax.NewExpression),
              (this.callee = e),
              (this.arguments = t);
          };
          t.NewExpression = V;
          var Y = function (e) {
            (this.type = r.Syntax.ObjectExpression), (this.properties = e);
          };
          t.ObjectExpression = Y;
          var K = function (e) {
            (this.type = r.Syntax.ObjectPattern), (this.properties = e);
          };
          t.ObjectPattern = K;
          var Q = function (e, t, n, i, s, o) {
            (this.type = r.Syntax.Property),
              (this.key = t),
              (this.computed = n),
              (this.value = i),
              (this.kind = e),
              (this.method = s),
              (this.shorthand = o);
          };
          t.Property = Q;
          var Z = function (e, t, n, i) {
            (this.type = r.Syntax.Literal),
              (this.value = e),
              (this.raw = t),
              (this.regex = { pattern: n, flags: i });
          };
          t.RegexLiteral = Z;
          var ee = function (e) {
            (this.type = r.Syntax.RestElement), (this.argument = e);
          };
          t.RestElement = ee;
          var te = function (e) {
            (this.type = r.Syntax.ReturnStatement), (this.argument = e);
          };
          t.ReturnStatement = te;
          var ne = function (e) {
            (this.type = r.Syntax.Program),
              (this.body = e),
              (this.sourceType = "script");
          };
          t.Script = ne;
          var re = function (e) {
            (this.type = r.Syntax.SequenceExpression), (this.expressions = e);
          };
          t.SequenceExpression = re;
          var ie = function (e) {
            (this.type = r.Syntax.SpreadElement), (this.argument = e);
          };
          t.SpreadElement = ie;
          var se = function (e, t) {
            (this.type = r.Syntax.MemberExpression),
              (this.computed = !1),
              (this.object = e),
              (this.property = t);
          };
          t.StaticMemberExpression = se;
          var oe = function () {
            this.type = r.Syntax.Super;
          };
          t.Super = oe;
          var ae = function (e, t) {
            (this.type = r.Syntax.SwitchCase),
              (this.test = e),
              (this.consequent = t);
          };
          t.SwitchCase = ae;
          var ue = function (e, t) {
            (this.type = r.Syntax.SwitchStatement),
              (this.discriminant = e),
              (this.cases = t);
          };
          t.SwitchStatement = ue;
          var ce = function (e, t) {
            (this.type = r.Syntax.TaggedTemplateExpression),
              (this.tag = e),
              (this.quasi = t);
          };
          t.TaggedTemplateExpression = ce;
          var le = function (e, t) {
            (this.type = r.Syntax.TemplateElement),
              (this.value = e),
              (this.tail = t);
          };
          t.TemplateElement = le;
          var he = function (e, t) {
            (this.type = r.Syntax.TemplateLiteral),
              (this.quasis = e),
              (this.expressions = t);
          };
          t.TemplateLiteral = he;
          var de = function () {
            this.type = r.Syntax.ThisExpression;
          };
          t.ThisExpression = de;
          var pe = function (e) {
            (this.type = r.Syntax.ThrowStatement), (this.argument = e);
          };
          t.ThrowStatement = pe;
          var fe = function (e, t, n) {
            (this.type = r.Syntax.TryStatement),
              (this.block = e),
              (this.handler = t),
              (this.finalizer = n);
          };
          t.TryStatement = fe;
          var me = function (e, t) {
            (this.type = r.Syntax.UnaryExpression),
              (this.operator = e),
              (this.argument = t),
              (this.prefix = !0);
          };
          t.UnaryExpression = me;
          var ge = function (e, t, n) {
            (this.type = r.Syntax.UpdateExpression),
              (this.operator = e),
              (this.argument = t),
              (this.prefix = n);
          };
          t.UpdateExpression = ge;
          var ye = function (e, t) {
            (this.type = r.Syntax.VariableDeclaration),
              (this.declarations = e),
              (this.kind = t);
          };
          t.VariableDeclaration = ye;
          var ve = function (e, t) {
            (this.type = r.Syntax.VariableDeclarator),
              (this.id = e),
              (this.init = t);
          };
          t.VariableDeclarator = ve;
          var Ee = function (e, t) {
            (this.type = r.Syntax.WhileStatement),
              (this.test = e),
              (this.body = t);
          };
          t.WhileStatement = Ee;
          var xe = function (e, t) {
            (this.type = r.Syntax.WithStatement),
              (this.object = e),
              (this.body = t);
          };
          t.WithStatement = xe;
          var be = function (e, t) {
            (this.type = r.Syntax.YieldExpression),
              (this.argument = e),
              (this.delegate = t);
          };
          t.YieldExpression = be;
        },
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(9),
            i = n(10),
            s = n(11),
            o = n(7),
            a = n(12),
            u = n(2),
            c = n(13),
            l = (function () {
              function e(e, t, n) {
                void 0 === t && (t = {}),
                  (this.config = {
                    range: "boolean" == typeof t.range && t.range,
                    loc: "boolean" == typeof t.loc && t.loc,
                    source: null,
                    tokens: "boolean" == typeof t.tokens && t.tokens,
                    comment: "boolean" == typeof t.comment && t.comment,
                    tolerant: "boolean" == typeof t.tolerant && t.tolerant,
                  }),
                  this.config.loc &&
                    t.source &&
                    null !== t.source &&
                    (this.config.source = String(t.source)),
                  (this.delegate = n),
                  (this.errorHandler = new i.ErrorHandler()),
                  (this.errorHandler.tolerant = this.config.tolerant),
                  (this.scanner = new a.Scanner(e, this.errorHandler)),
                  (this.scanner.trackComment = this.config.comment),
                  (this.operatorPrecedence = {
                    ")": 0,
                    ";": 0,
                    ",": 0,
                    "=": 0,
                    "]": 0,
                    "||": 1,
                    "&&": 2,
                    "|": 3,
                    "^": 4,
                    "&": 5,
                    "==": 6,
                    "!=": 6,
                    "===": 6,
                    "!==": 6,
                    "<": 7,
                    ">": 7,
                    "<=": 7,
                    ">=": 7,
                    "<<": 8,
                    ">>": 8,
                    ">>>": 8,
                    "+": 9,
                    "-": 9,
                    "*": 11,
                    "/": 11,
                    "%": 11,
                  }),
                  (this.lookahead = {
                    type: 2,
                    value: "",
                    lineNumber: this.scanner.lineNumber,
                    lineStart: 0,
                    start: 0,
                    end: 0,
                  }),
                  (this.hasLineTerminator = !1),
                  (this.context = {
                    isModule: !1,
                    await: !1,
                    allowIn: !0,
                    allowStrictDirective: !0,
                    allowYield: !0,
                    firstCoverInitializedNameError: null,
                    isAssignmentTarget: !1,
                    isBindingElement: !1,
                    inFunctionBody: !1,
                    inIteration: !1,
                    inSwitch: !1,
                    labelSet: {},
                    strict: !1,
                  }),
                  (this.tokens = []),
                  (this.startMarker = {
                    index: 0,
                    line: this.scanner.lineNumber,
                    column: 0,
                  }),
                  (this.lastMarker = {
                    index: 0,
                    line: this.scanner.lineNumber,
                    column: 0,
                  }),
                  this.nextToken(),
                  (this.lastMarker = {
                    index: this.scanner.index,
                    line: this.scanner.lineNumber,
                    column: this.scanner.index - this.scanner.lineStart,
                  });
              }
              return (
                (e.prototype.throwError = function (e) {
                  for (var t = [], n = 1; n < arguments.length; n++)
                    t[n - 1] = arguments[n];
                  var i = Array.prototype.slice.call(arguments, 1),
                    s = e.replace(/%(\d)/g, function (e, t) {
                      return (
                        r.assert(
                          t < i.length,
                          "Message reference must be in range"
                        ),
                        i[t]
                      );
                    }),
                    o = this.lastMarker.index,
                    a = this.lastMarker.line,
                    u = this.lastMarker.column + 1;
                  throw this.errorHandler.createError(o, a, u, s);
                }),
                (e.prototype.tolerateError = function (e) {
                  for (var t = [], n = 1; n < arguments.length; n++)
                    t[n - 1] = arguments[n];
                  var i = Array.prototype.slice.call(arguments, 1),
                    s = e.replace(/%(\d)/g, function (e, t) {
                      return (
                        r.assert(
                          t < i.length,
                          "Message reference must be in range"
                        ),
                        i[t]
                      );
                    }),
                    o = this.lastMarker.index,
                    a = this.scanner.lineNumber,
                    u = this.lastMarker.column + 1;
                  this.errorHandler.tolerateError(o, a, u, s);
                }),
                (e.prototype.unexpectedTokenError = function (e, t) {
                  var n,
                    r = t || s.Messages.UnexpectedToken;
                  if (
                    (e
                      ? (t ||
                          ((r =
                            2 === e.type
                              ? s.Messages.UnexpectedEOS
                              : 3 === e.type
                              ? s.Messages.UnexpectedIdentifier
                              : 6 === e.type
                              ? s.Messages.UnexpectedNumber
                              : 8 === e.type
                              ? s.Messages.UnexpectedString
                              : 10 === e.type
                              ? s.Messages.UnexpectedTemplate
                              : s.Messages.UnexpectedToken),
                          4 === e.type &&
                            (this.scanner.isFutureReservedWord(e.value)
                              ? (r = s.Messages.UnexpectedReserved)
                              : this.context.strict &&
                                this.scanner.isStrictModeReservedWord(
                                  e.value
                                ) &&
                                (r = s.Messages.StrictReservedWord))),
                        (n = e.value))
                      : (n = "ILLEGAL"),
                    (r = r.replace("%0", n)),
                    e && "number" == typeof e.lineNumber)
                  ) {
                    var i = e.start,
                      o = e.lineNumber,
                      a = this.lastMarker.index - this.lastMarker.column,
                      u = e.start - a + 1;
                    return this.errorHandler.createError(i, o, u, r);
                  }
                  return (
                    (i = this.lastMarker.index),
                    (o = this.lastMarker.line),
                    (u = this.lastMarker.column + 1),
                    this.errorHandler.createError(i, o, u, r)
                  );
                }),
                (e.prototype.throwUnexpectedToken = function (e, t) {
                  throw this.unexpectedTokenError(e, t);
                }),
                (e.prototype.tolerateUnexpectedToken = function (e, t) {
                  this.errorHandler.tolerate(this.unexpectedTokenError(e, t));
                }),
                (e.prototype.collectComments = function () {
                  if (this.config.comment) {
                    var e = this.scanner.scanComments();
                    if (e.length > 0 && this.delegate)
                      for (var t = 0; t < e.length; ++t) {
                        var n = e[t],
                          r = void 0;
                        (r = {
                          type: n.multiLine ? "BlockComment" : "LineComment",
                          value: this.scanner.source.slice(
                            n.slice[0],
                            n.slice[1]
                          ),
                        }),
                          this.config.range && (r.range = n.range),
                          this.config.loc && (r.loc = n.loc);
                        var i = {
                          start: {
                            line: n.loc.start.line,
                            column: n.loc.start.column,
                            offset: n.range[0],
                          },
                          end: {
                            line: n.loc.end.line,
                            column: n.loc.end.column,
                            offset: n.range[1],
                          },
                        };
                        this.delegate(r, i);
                      }
                  } else this.scanner.scanComments();
                }),
                (e.prototype.getTokenRaw = function (e) {
                  return this.scanner.source.slice(e.start, e.end);
                }),
                (e.prototype.convertToken = function (e) {
                  var t = {
                    type: c.TokenName[e.type],
                    value: this.getTokenRaw(e),
                  };
                  if (
                    (this.config.range && (t.range = [e.start, e.end]),
                    this.config.loc &&
                      (t.loc = {
                        start: {
                          line: this.startMarker.line,
                          column: this.startMarker.column,
                        },
                        end: {
                          line: this.scanner.lineNumber,
                          column: this.scanner.index - this.scanner.lineStart,
                        },
                      }),
                    9 === e.type)
                  ) {
                    var n = e.pattern,
                      r = e.flags;
                    t.regex = { pattern: n, flags: r };
                  }
                  return t;
                }),
                (e.prototype.nextToken = function () {
                  var e = this.lookahead;
                  (this.lastMarker.index = this.scanner.index),
                    (this.lastMarker.line = this.scanner.lineNumber),
                    (this.lastMarker.column =
                      this.scanner.index - this.scanner.lineStart),
                    this.collectComments(),
                    this.scanner.index !== this.startMarker.index &&
                      ((this.startMarker.index = this.scanner.index),
                      (this.startMarker.line = this.scanner.lineNumber),
                      (this.startMarker.column =
                        this.scanner.index - this.scanner.lineStart));
                  var t = this.scanner.lex();
                  return (
                    (this.hasLineTerminator = e.lineNumber !== t.lineNumber),
                    t &&
                      this.context.strict &&
                      3 === t.type &&
                      this.scanner.isStrictModeReservedWord(t.value) &&
                      (t.type = 4),
                    (this.lookahead = t),
                    this.config.tokens &&
                      2 !== t.type &&
                      this.tokens.push(this.convertToken(t)),
                    e
                  );
                }),
                (e.prototype.nextRegexToken = function () {
                  this.collectComments();
                  var e = this.scanner.scanRegExp();
                  return (
                    this.config.tokens &&
                      (this.tokens.pop(),
                      this.tokens.push(this.convertToken(e))),
                    (this.lookahead = e),
                    this.nextToken(),
                    e
                  );
                }),
                (e.prototype.createNode = function () {
                  return {
                    index: this.startMarker.index,
                    line: this.startMarker.line,
                    column: this.startMarker.column,
                  };
                }),
                (e.prototype.startNode = function (e, t) {
                  void 0 === t && (t = 0);
                  var n = e.start - e.lineStart,
                    r = e.lineNumber;
                  return (
                    n < 0 && ((n += t), r--),
                    { index: e.start, line: r, column: n }
                  );
                }),
                (e.prototype.finalize = function (e, t) {
                  if (
                    (this.config.range &&
                      (t.range = [e.index, this.lastMarker.index]),
                    this.config.loc &&
                      ((t.loc = {
                        start: { line: e.line, column: e.column },
                        end: {
                          line: this.lastMarker.line,
                          column: this.lastMarker.column,
                        },
                      }),
                      this.config.source &&
                        (t.loc.source = this.config.source)),
                    this.delegate)
                  ) {
                    var n = {
                      start: {
                        line: e.line,
                        column: e.column,
                        offset: e.index,
                      },
                      end: {
                        line: this.lastMarker.line,
                        column: this.lastMarker.column,
                        offset: this.lastMarker.index,
                      },
                    };
                    this.delegate(t, n);
                  }
                  return t;
                }),
                (e.prototype.expect = function (e) {
                  var t = this.nextToken();
                  (7 === t.type && t.value === e) ||
                    this.throwUnexpectedToken(t);
                }),
                (e.prototype.expectCommaSeparator = function () {
                  if (this.config.tolerant) {
                    var e = this.lookahead;
                    7 === e.type && "," === e.value
                      ? this.nextToken()
                      : 7 === e.type && ";" === e.value
                      ? (this.nextToken(), this.tolerateUnexpectedToken(e))
                      : this.tolerateUnexpectedToken(
                          e,
                          s.Messages.UnexpectedToken
                        );
                  } else this.expect(",");
                }),
                (e.prototype.expectKeyword = function (e) {
                  var t = this.nextToken();
                  (4 === t.type && t.value === e) ||
                    this.throwUnexpectedToken(t);
                }),
                (e.prototype.match = function (e) {
                  return (
                    7 === this.lookahead.type && this.lookahead.value === e
                  );
                }),
                (e.prototype.matchKeyword = function (e) {
                  return (
                    4 === this.lookahead.type && this.lookahead.value === e
                  );
                }),
                (e.prototype.matchContextualKeyword = function (e) {
                  return (
                    3 === this.lookahead.type && this.lookahead.value === e
                  );
                }),
                (e.prototype.matchAssign = function () {
                  if (7 !== this.lookahead.type) return !1;
                  var e = this.lookahead.value;
                  return (
                    "=" === e ||
                    "*=" === e ||
                    "**=" === e ||
                    "/=" === e ||
                    "%=" === e ||
                    "+=" === e ||
                    "-=" === e ||
                    "<<=" === e ||
                    ">>=" === e ||
                    ">>>=" === e ||
                    "&=" === e ||
                    "^=" === e ||
                    "|=" === e
                  );
                }),
                (e.prototype.isolateCoverGrammar = function (e) {
                  var t = this.context.isBindingElement,
                    n = this.context.isAssignmentTarget,
                    r = this.context.firstCoverInitializedNameError;
                  (this.context.isBindingElement = !0),
                    (this.context.isAssignmentTarget = !0),
                    (this.context.firstCoverInitializedNameError = null);
                  var i = e.call(this);
                  return (
                    null !== this.context.firstCoverInitializedNameError &&
                      this.throwUnexpectedToken(
                        this.context.firstCoverInitializedNameError
                      ),
                    (this.context.isBindingElement = t),
                    (this.context.isAssignmentTarget = n),
                    (this.context.firstCoverInitializedNameError = r),
                    i
                  );
                }),
                (e.prototype.inheritCoverGrammar = function (e) {
                  var t = this.context.isBindingElement,
                    n = this.context.isAssignmentTarget,
                    r = this.context.firstCoverInitializedNameError;
                  (this.context.isBindingElement = !0),
                    (this.context.isAssignmentTarget = !0),
                    (this.context.firstCoverInitializedNameError = null);
                  var i = e.call(this);
                  return (
                    (this.context.isBindingElement =
                      this.context.isBindingElement && t),
                    (this.context.isAssignmentTarget =
                      this.context.isAssignmentTarget && n),
                    (this.context.firstCoverInitializedNameError =
                      r || this.context.firstCoverInitializedNameError),
                    i
                  );
                }),
                (e.prototype.consumeSemicolon = function () {
                  this.match(";")
                    ? this.nextToken()
                    : this.hasLineTerminator ||
                      (2 === this.lookahead.type ||
                        this.match("}") ||
                        this.throwUnexpectedToken(this.lookahead),
                      (this.lastMarker.index = this.startMarker.index),
                      (this.lastMarker.line = this.startMarker.line),
                      (this.lastMarker.column = this.startMarker.column));
                }),
                (e.prototype.parsePrimaryExpression = function () {
                  var e,
                    t,
                    n,
                    r = this.createNode();
                  switch (this.lookahead.type) {
                    case 3:
                      (this.context.isModule || this.context.await) &&
                        "await" === this.lookahead.value &&
                        this.tolerateUnexpectedToken(this.lookahead),
                        (e = this.matchAsyncFunction()
                          ? this.parseFunctionExpression()
                          : this.finalize(
                              r,
                              new o.Identifier(this.nextToken().value)
                            ));
                      break;
                    case 6:
                    case 8:
                      this.context.strict &&
                        this.lookahead.octal &&
                        this.tolerateUnexpectedToken(
                          this.lookahead,
                          s.Messages.StrictOctalLiteral
                        ),
                        (this.context.isAssignmentTarget = !1),
                        (this.context.isBindingElement = !1),
                        (t = this.nextToken()),
                        (n = this.getTokenRaw(t)),
                        (e = this.finalize(r, new o.Literal(t.value, n)));
                      break;
                    case 1:
                      (this.context.isAssignmentTarget = !1),
                        (this.context.isBindingElement = !1),
                        (t = this.nextToken()),
                        (n = this.getTokenRaw(t)),
                        (e = this.finalize(
                          r,
                          new o.Literal("true" === t.value, n)
                        ));
                      break;
                    case 5:
                      (this.context.isAssignmentTarget = !1),
                        (this.context.isBindingElement = !1),
                        (t = this.nextToken()),
                        (n = this.getTokenRaw(t)),
                        (e = this.finalize(r, new o.Literal(null, n)));
                      break;
                    case 10:
                      e = this.parseTemplateLiteral();
                      break;
                    case 7:
                      switch (this.lookahead.value) {
                        case "(":
                          (this.context.isBindingElement = !1),
                            (e = this.inheritCoverGrammar(
                              this.parseGroupExpression
                            ));
                          break;
                        case "[":
                          e = this.inheritCoverGrammar(
                            this.parseArrayInitializer
                          );
                          break;
                        case "{":
                          e = this.inheritCoverGrammar(
                            this.parseObjectInitializer
                          );
                          break;
                        case "/":
                        case "/=":
                          (this.context.isAssignmentTarget = !1),
                            (this.context.isBindingElement = !1),
                            (this.scanner.index = this.startMarker.index),
                            (t = this.nextRegexToken()),
                            (n = this.getTokenRaw(t)),
                            (e = this.finalize(
                              r,
                              new o.RegexLiteral(t.regex, n, t.pattern, t.flags)
                            ));
                          break;
                        default:
                          e = this.throwUnexpectedToken(this.nextToken());
                      }
                      break;
                    case 4:
                      !this.context.strict &&
                      this.context.allowYield &&
                      this.matchKeyword("yield")
                        ? (e = this.parseIdentifierName())
                        : !this.context.strict && this.matchKeyword("let")
                        ? (e = this.finalize(
                            r,
                            new o.Identifier(this.nextToken().value)
                          ))
                        : ((this.context.isAssignmentTarget = !1),
                          (this.context.isBindingElement = !1),
                          this.matchKeyword("function")
                            ? (e = this.parseFunctionExpression())
                            : this.matchKeyword("this")
                            ? (this.nextToken(),
                              (e = this.finalize(r, new o.ThisExpression())))
                            : (e = this.matchKeyword("class")
                                ? this.parseClassExpression()
                                : this.throwUnexpectedToken(this.nextToken())));
                      break;
                    default:
                      e = this.throwUnexpectedToken(this.nextToken());
                  }
                  return e;
                }),
                (e.prototype.parseSpreadElement = function () {
                  var e = this.createNode();
                  this.expect("...");
                  var t = this.inheritCoverGrammar(
                    this.parseAssignmentExpression
                  );
                  return this.finalize(e, new o.SpreadElement(t));
                }),
                (e.prototype.parseArrayInitializer = function () {
                  var e = this.createNode(),
                    t = [];
                  for (this.expect("["); !this.match("]"); )
                    if (this.match(",")) this.nextToken(), t.push(null);
                    else if (this.match("...")) {
                      var n = this.parseSpreadElement();
                      this.match("]") ||
                        ((this.context.isAssignmentTarget = !1),
                        (this.context.isBindingElement = !1),
                        this.expect(",")),
                        t.push(n);
                    } else
                      t.push(
                        this.inheritCoverGrammar(this.parseAssignmentExpression)
                      ),
                        this.match("]") || this.expect(",");
                  return (
                    this.expect("]"), this.finalize(e, new o.ArrayExpression(t))
                  );
                }),
                (e.prototype.parsePropertyMethod = function (e) {
                  (this.context.isAssignmentTarget = !1),
                    (this.context.isBindingElement = !1);
                  var t = this.context.strict,
                    n = this.context.allowStrictDirective;
                  this.context.allowStrictDirective = e.simple;
                  var r = this.isolateCoverGrammar(
                    this.parseFunctionSourceElements
                  );
                  return (
                    this.context.strict &&
                      e.firstRestricted &&
                      this.tolerateUnexpectedToken(
                        e.firstRestricted,
                        e.message
                      ),
                    this.context.strict &&
                      e.stricted &&
                      this.tolerateUnexpectedToken(e.stricted, e.message),
                    (this.context.strict = t),
                    (this.context.allowStrictDirective = n),
                    r
                  );
                }),
                (e.prototype.parsePropertyMethodFunction = function () {
                  var e = this.createNode(),
                    t = this.context.allowYield;
                  this.context.allowYield = !0;
                  var n = this.parseFormalParameters(),
                    r = this.parsePropertyMethod(n);
                  return (
                    (this.context.allowYield = t),
                    this.finalize(
                      e,
                      new o.FunctionExpression(null, n.params, r, !1)
                    )
                  );
                }),
                (e.prototype.parsePropertyMethodAsyncFunction = function () {
                  var e = this.createNode(),
                    t = this.context.allowYield,
                    n = this.context.await;
                  (this.context.allowYield = !1), (this.context.await = !0);
                  var r = this.parseFormalParameters(),
                    i = this.parsePropertyMethod(r);
                  return (
                    (this.context.allowYield = t),
                    (this.context.await = n),
                    this.finalize(
                      e,
                      new o.AsyncFunctionExpression(null, r.params, i)
                    )
                  );
                }),
                (e.prototype.parseObjectPropertyKey = function () {
                  var e,
                    t = this.createNode(),
                    n = this.nextToken();
                  switch (n.type) {
                    case 8:
                    case 6:
                      this.context.strict &&
                        n.octal &&
                        this.tolerateUnexpectedToken(
                          n,
                          s.Messages.StrictOctalLiteral
                        );
                      var r = this.getTokenRaw(n);
                      e = this.finalize(t, new o.Literal(n.value, r));
                      break;
                    case 3:
                    case 1:
                    case 5:
                    case 4:
                      e = this.finalize(t, new o.Identifier(n.value));
                      break;
                    case 7:
                      "[" === n.value
                        ? ((e = this.isolateCoverGrammar(
                            this.parseAssignmentExpression
                          )),
                          this.expect("]"))
                        : (e = this.throwUnexpectedToken(n));
                      break;
                    default:
                      e = this.throwUnexpectedToken(n);
                  }
                  return e;
                }),
                (e.prototype.isPropertyKey = function (e, t) {
                  return (
                    (e.type === u.Syntax.Identifier && e.name === t) ||
                    (e.type === u.Syntax.Literal && e.value === t)
                  );
                }),
                (e.prototype.parseObjectProperty = function (e) {
                  var t,
                    n = this.createNode(),
                    r = this.lookahead,
                    i = null,
                    a = null,
                    u = !1,
                    c = !1,
                    l = !1,
                    h = !1;
                  if (3 === r.type) {
                    var d = r.value;
                    this.nextToken(),
                      (u = this.match("[")),
                      (i = (h = !(
                        this.hasLineTerminator ||
                        "async" !== d ||
                        this.match(":") ||
                        this.match("(") ||
                        this.match("*") ||
                        this.match(",")
                      ))
                        ? this.parseObjectPropertyKey()
                        : this.finalize(n, new o.Identifier(d)));
                  } else
                    this.match("*")
                      ? this.nextToken()
                      : ((u = this.match("[")),
                        (i = this.parseObjectPropertyKey()));
                  var p = this.qualifiedPropertyName(this.lookahead);
                  if (3 === r.type && !h && "get" === r.value && p)
                    (t = "get"),
                      (u = this.match("[")),
                      (i = this.parseObjectPropertyKey()),
                      (this.context.allowYield = !1),
                      (a = this.parseGetterMethod());
                  else if (3 === r.type && !h && "set" === r.value && p)
                    (t = "set"),
                      (u = this.match("[")),
                      (i = this.parseObjectPropertyKey()),
                      (a = this.parseSetterMethod());
                  else if (7 === r.type && "*" === r.value && p)
                    (t = "init"),
                      (u = this.match("[")),
                      (i = this.parseObjectPropertyKey()),
                      (a = this.parseGeneratorMethod()),
                      (c = !0);
                  else if (
                    (i || this.throwUnexpectedToken(this.lookahead),
                    (t = "init"),
                    this.match(":") && !h)
                  )
                    !u &&
                      this.isPropertyKey(i, "__proto__") &&
                      (e.value &&
                        this.tolerateError(s.Messages.DuplicateProtoProperty),
                      (e.value = !0)),
                      this.nextToken(),
                      (a = this.inheritCoverGrammar(
                        this.parseAssignmentExpression
                      ));
                  else if (this.match("("))
                    (a = h
                      ? this.parsePropertyMethodAsyncFunction()
                      : this.parsePropertyMethodFunction()),
                      (c = !0);
                  else if (3 === r.type)
                    if (
                      ((d = this.finalize(n, new o.Identifier(r.value))),
                      this.match("="))
                    ) {
                      (this.context.firstCoverInitializedNameError = this.lookahead),
                        this.nextToken(),
                        (l = !0);
                      var f = this.isolateCoverGrammar(
                        this.parseAssignmentExpression
                      );
                      a = this.finalize(n, new o.AssignmentPattern(d, f));
                    } else (l = !0), (a = d);
                  else this.throwUnexpectedToken(this.nextToken());
                  return this.finalize(n, new o.Property(t, i, u, a, c, l));
                }),
                (e.prototype.parseObjectInitializer = function () {
                  var e = this.createNode();
                  this.expect("{");
                  for (var t = [], n = { value: !1 }; !this.match("}"); )
                    t.push(this.parseObjectProperty(n)),
                      this.match("}") || this.expectCommaSeparator();
                  return (
                    this.expect("}"),
                    this.finalize(e, new o.ObjectExpression(t))
                  );
                }),
                (e.prototype.parseTemplateHead = function () {
                  r.assert(
                    this.lookahead.head,
                    "Template literal must start with a template head"
                  );
                  var e = this.createNode(),
                    t = this.nextToken(),
                    n = t.value,
                    i = t.cooked;
                  return this.finalize(
                    e,
                    new o.TemplateElement({ raw: n, cooked: i }, t.tail)
                  );
                }),
                (e.prototype.parseTemplateElement = function () {
                  10 !== this.lookahead.type && this.throwUnexpectedToken();
                  var e = this.createNode(),
                    t = this.nextToken(),
                    n = t.value,
                    r = t.cooked;
                  return this.finalize(
                    e,
                    new o.TemplateElement({ raw: n, cooked: r }, t.tail)
                  );
                }),
                (e.prototype.parseTemplateLiteral = function () {
                  var e = this.createNode(),
                    t = [],
                    n = [],
                    r = this.parseTemplateHead();
                  for (n.push(r); !r.tail; )
                    t.push(this.parseExpression()),
                      (r = this.parseTemplateElement()),
                      n.push(r);
                  return this.finalize(e, new o.TemplateLiteral(n, t));
                }),
                (e.prototype.reinterpretExpressionAsPattern = function (e) {
                  switch (e.type) {
                    case u.Syntax.Identifier:
                    case u.Syntax.MemberExpression:
                    case u.Syntax.RestElement:
                    case u.Syntax.AssignmentPattern:
                      break;
                    case u.Syntax.SpreadElement:
                      (e.type = u.Syntax.RestElement),
                        this.reinterpretExpressionAsPattern(e.argument);
                      break;
                    case u.Syntax.ArrayExpression:
                      e.type = u.Syntax.ArrayPattern;
                      for (var t = 0; t < e.elements.length; t++)
                        null !== e.elements[t] &&
                          this.reinterpretExpressionAsPattern(e.elements[t]);
                      break;
                    case u.Syntax.ObjectExpression:
                      for (
                        e.type = u.Syntax.ObjectPattern, t = 0;
                        t < e.properties.length;
                        t++
                      )
                        this.reinterpretExpressionAsPattern(
                          e.properties[t].value
                        );
                      break;
                    case u.Syntax.AssignmentExpression:
                      (e.type = u.Syntax.AssignmentPattern),
                        delete e.operator,
                        this.reinterpretExpressionAsPattern(e.left);
                  }
                }),
                (e.prototype.parseGroupExpression = function () {
                  var e;
                  if ((this.expect("("), this.match(")")))
                    this.nextToken(),
                      this.match("=>") || this.expect("=>"),
                      (e = {
                        type: "ArrowParameterPlaceHolder",
                        params: [],
                        async: !1,
                      });
                  else {
                    var t = this.lookahead,
                      n = [];
                    if (this.match("..."))
                      (e = this.parseRestElement(n)),
                        this.expect(")"),
                        this.match("=>") || this.expect("=>"),
                        (e = {
                          type: "ArrowParameterPlaceHolder",
                          params: [e],
                          async: !1,
                        });
                    else {
                      var r = !1;
                      if (
                        ((this.context.isBindingElement = !0),
                        (e = this.inheritCoverGrammar(
                          this.parseAssignmentExpression
                        )),
                        this.match(","))
                      ) {
                        var i = [];
                        for (
                          this.context.isAssignmentTarget = !1, i.push(e);
                          2 !== this.lookahead.type && this.match(",");

                        ) {
                          if ((this.nextToken(), this.match(")"))) {
                            this.nextToken();
                            for (var s = 0; s < i.length; s++)
                              this.reinterpretExpressionAsPattern(i[s]);
                            (r = !0),
                              (e = {
                                type: "ArrowParameterPlaceHolder",
                                params: i,
                                async: !1,
                              });
                          } else if (this.match("...")) {
                            for (
                              this.context.isBindingElement ||
                                this.throwUnexpectedToken(this.lookahead),
                                i.push(this.parseRestElement(n)),
                                this.expect(")"),
                                this.match("=>") || this.expect("=>"),
                                this.context.isBindingElement = !1,
                                s = 0;
                              s < i.length;
                              s++
                            )
                              this.reinterpretExpressionAsPattern(i[s]);
                            (r = !0),
                              (e = {
                                type: "ArrowParameterPlaceHolder",
                                params: i,
                                async: !1,
                              });
                          } else
                            i.push(
                              this.inheritCoverGrammar(
                                this.parseAssignmentExpression
                              )
                            );
                          if (r) break;
                        }
                        r ||
                          (e = this.finalize(
                            this.startNode(t),
                            new o.SequenceExpression(i)
                          ));
                      }
                      if (!r) {
                        if (
                          (this.expect(")"),
                          this.match("=>") &&
                            (e.type === u.Syntax.Identifier &&
                              "yield" === e.name &&
                              ((r = !0),
                              (e = {
                                type: "ArrowParameterPlaceHolder",
                                params: [e],
                                async: !1,
                              })),
                            !r))
                        ) {
                          if (
                            (this.context.isBindingElement ||
                              this.throwUnexpectedToken(this.lookahead),
                            e.type === u.Syntax.SequenceExpression)
                          )
                            for (s = 0; s < e.expressions.length; s++)
                              this.reinterpretExpressionAsPattern(
                                e.expressions[s]
                              );
                          else this.reinterpretExpressionAsPattern(e);
                          e = {
                            type: "ArrowParameterPlaceHolder",
                            params:
                              e.type === u.Syntax.SequenceExpression
                                ? e.expressions
                                : [e],
                            async: !1,
                          };
                        }
                        this.context.isBindingElement = !1;
                      }
                    }
                  }
                  return e;
                }),
                (e.prototype.parseArguments = function () {
                  this.expect("(");
                  var e = [];
                  if (!this.match(")"))
                    for (;;) {
                      var t = this.match("...")
                        ? this.parseSpreadElement()
                        : this.isolateCoverGrammar(
                            this.parseAssignmentExpression
                          );
                      if ((e.push(t), this.match(")"))) break;
                      if ((this.expectCommaSeparator(), this.match(")"))) break;
                    }
                  return this.expect(")"), e;
                }),
                (e.prototype.isIdentifierName = function (e) {
                  return (
                    3 === e.type || 4 === e.type || 1 === e.type || 5 === e.type
                  );
                }),
                (e.prototype.parseIdentifierName = function () {
                  var e = this.createNode(),
                    t = this.nextToken();
                  return (
                    this.isIdentifierName(t) || this.throwUnexpectedToken(t),
                    this.finalize(e, new o.Identifier(t.value))
                  );
                }),
                (e.prototype.parseNewExpression = function () {
                  var e,
                    t = this.createNode(),
                    n = this.parseIdentifierName();
                  if (
                    (r.assert(
                      "new" === n.name,
                      "New expression must start with `new`"
                    ),
                    this.match("."))
                  )
                    if (
                      (this.nextToken(),
                      3 === this.lookahead.type &&
                        this.context.inFunctionBody &&
                        "target" === this.lookahead.value)
                    ) {
                      var i = this.parseIdentifierName();
                      e = new o.MetaProperty(n, i);
                    } else this.throwUnexpectedToken(this.lookahead);
                  else {
                    var s = this.isolateCoverGrammar(
                        this.parseLeftHandSideExpression
                      ),
                      a = this.match("(") ? this.parseArguments() : [];
                    (e = new o.NewExpression(s, a)),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                  }
                  return this.finalize(t, e);
                }),
                (e.prototype.parseAsyncArgument = function () {
                  var e = this.parseAssignmentExpression();
                  return (
                    (this.context.firstCoverInitializedNameError = null), e
                  );
                }),
                (e.prototype.parseAsyncArguments = function () {
                  this.expect("(");
                  var e = [];
                  if (!this.match(")"))
                    for (;;) {
                      var t = this.match("...")
                        ? this.parseSpreadElement()
                        : this.isolateCoverGrammar(this.parseAsyncArgument);
                      if ((e.push(t), this.match(")"))) break;
                      if ((this.expectCommaSeparator(), this.match(")"))) break;
                    }
                  return this.expect(")"), e;
                }),
                (e.prototype.parseLeftHandSideExpressionAllowCall = function () {
                  var e,
                    t = this.lookahead,
                    n = this.matchContextualKeyword("async"),
                    r = this.context.allowIn;
                  for (
                    this.context.allowIn = !0,
                      this.matchKeyword("super") && this.context.inFunctionBody
                        ? ((e = this.createNode()),
                          this.nextToken(),
                          (e = this.finalize(e, new o.Super())),
                          this.match("(") ||
                            this.match(".") ||
                            this.match("[") ||
                            this.throwUnexpectedToken(this.lookahead))
                        : (e = this.inheritCoverGrammar(
                            this.matchKeyword("new")
                              ? this.parseNewExpression
                              : this.parsePrimaryExpression
                          ));
                    ;

                  )
                    if (this.match(".")) {
                      (this.context.isBindingElement = !1),
                        (this.context.isAssignmentTarget = !0),
                        this.expect(".");
                      var i = this.parseIdentifierName();
                      e = this.finalize(
                        this.startNode(t),
                        new o.StaticMemberExpression(e, i)
                      );
                    } else if (this.match("(")) {
                      var s = n && t.lineNumber === this.lookahead.lineNumber;
                      (this.context.isBindingElement = !1),
                        (this.context.isAssignmentTarget = !1);
                      var a = s
                        ? this.parseAsyncArguments()
                        : this.parseArguments();
                      if (
                        ((e = this.finalize(
                          this.startNode(t),
                          new o.CallExpression(e, a)
                        )),
                        s && this.match("=>"))
                      ) {
                        for (var u = 0; u < a.length; ++u)
                          this.reinterpretExpressionAsPattern(a[u]);
                        e = {
                          type: "ArrowParameterPlaceHolder",
                          params: a,
                          async: !0,
                        };
                      }
                    } else if (this.match("["))
                      (this.context.isBindingElement = !1),
                        (this.context.isAssignmentTarget = !0),
                        this.expect("["),
                        (i = this.isolateCoverGrammar(this.parseExpression)),
                        this.expect("]"),
                        (e = this.finalize(
                          this.startNode(t),
                          new o.ComputedMemberExpression(e, i)
                        ));
                    else {
                      if (10 !== this.lookahead.type || !this.lookahead.head)
                        break;
                      var c = this.parseTemplateLiteral();
                      e = this.finalize(
                        this.startNode(t),
                        new o.TaggedTemplateExpression(e, c)
                      );
                    }
                  return (this.context.allowIn = r), e;
                }),
                (e.prototype.parseSuper = function () {
                  var e = this.createNode();
                  return (
                    this.expectKeyword("super"),
                    this.match("[") ||
                      this.match(".") ||
                      this.throwUnexpectedToken(this.lookahead),
                    this.finalize(e, new o.Super())
                  );
                }),
                (e.prototype.parseLeftHandSideExpression = function () {
                  r.assert(
                    this.context.allowIn,
                    "callee of new expression always allow in keyword."
                  );
                  for (
                    var e = this.startNode(this.lookahead),
                      t =
                        this.matchKeyword("super") &&
                        this.context.inFunctionBody
                          ? this.parseSuper()
                          : this.inheritCoverGrammar(
                              this.matchKeyword("new")
                                ? this.parseNewExpression
                                : this.parsePrimaryExpression
                            );
                    ;

                  )
                    if (this.match("[")) {
                      (this.context.isBindingElement = !1),
                        (this.context.isAssignmentTarget = !0),
                        this.expect("[");
                      var n = this.isolateCoverGrammar(this.parseExpression);
                      this.expect("]"),
                        (t = this.finalize(
                          e,
                          new o.ComputedMemberExpression(t, n)
                        ));
                    } else if (this.match("."))
                      (this.context.isBindingElement = !1),
                        (this.context.isAssignmentTarget = !0),
                        this.expect("."),
                        (n = this.parseIdentifierName()),
                        (t = this.finalize(
                          e,
                          new o.StaticMemberExpression(t, n)
                        ));
                    else {
                      if (10 !== this.lookahead.type || !this.lookahead.head)
                        break;
                      var i = this.parseTemplateLiteral();
                      t = this.finalize(
                        e,
                        new o.TaggedTemplateExpression(t, i)
                      );
                    }
                  return t;
                }),
                (e.prototype.parseUpdateExpression = function () {
                  var e,
                    t = this.lookahead;
                  if (this.match("++") || this.match("--")) {
                    var n = this.startNode(t),
                      r = this.nextToken();
                    (e = this.inheritCoverGrammar(this.parseUnaryExpression)),
                      this.context.strict &&
                        e.type === u.Syntax.Identifier &&
                        this.scanner.isRestrictedWord(e.name) &&
                        this.tolerateError(s.Messages.StrictLHSPrefix),
                      this.context.isAssignmentTarget ||
                        this.tolerateError(s.Messages.InvalidLHSInAssignment);
                    var i = !0;
                    (e = this.finalize(
                      n,
                      new o.UpdateExpression(r.value, e, i)
                    )),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                  } else if (
                    ((e = this.inheritCoverGrammar(
                      this.parseLeftHandSideExpressionAllowCall
                    )),
                    !this.hasLineTerminator &&
                      7 === this.lookahead.type &&
                      (this.match("++") || this.match("--")))
                  ) {
                    this.context.strict &&
                      e.type === u.Syntax.Identifier &&
                      this.scanner.isRestrictedWord(e.name) &&
                      this.tolerateError(s.Messages.StrictLHSPostfix),
                      this.context.isAssignmentTarget ||
                        this.tolerateError(s.Messages.InvalidLHSInAssignment),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                    var a = this.nextToken().value;
                    (i = !1),
                      (e = this.finalize(
                        this.startNode(t),
                        new o.UpdateExpression(a, e, i)
                      ));
                  }
                  return e;
                }),
                (e.prototype.parseAwaitExpression = function () {
                  var e = this.createNode();
                  this.nextToken();
                  var t = this.parseUnaryExpression();
                  return this.finalize(e, new o.AwaitExpression(t));
                }),
                (e.prototype.parseUnaryExpression = function () {
                  var e;
                  if (
                    this.match("+") ||
                    this.match("-") ||
                    this.match("~") ||
                    this.match("!") ||
                    this.matchKeyword("delete") ||
                    this.matchKeyword("void") ||
                    this.matchKeyword("typeof")
                  ) {
                    var t = this.startNode(this.lookahead),
                      n = this.nextToken();
                    (e = this.inheritCoverGrammar(this.parseUnaryExpression)),
                      (e = this.finalize(t, new o.UnaryExpression(n.value, e))),
                      this.context.strict &&
                        "delete" === e.operator &&
                        e.argument.type === u.Syntax.Identifier &&
                        this.tolerateError(s.Messages.StrictDelete),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                  } else
                    e =
                      this.context.await && this.matchContextualKeyword("await")
                        ? this.parseAwaitExpression()
                        : this.parseUpdateExpression();
                  return e;
                }),
                (e.prototype.parseExponentiationExpression = function () {
                  var e = this.lookahead,
                    t = this.inheritCoverGrammar(this.parseUnaryExpression);
                  if (t.type !== u.Syntax.UnaryExpression && this.match("**")) {
                    this.nextToken(),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                    var n = t,
                      r = this.isolateCoverGrammar(
                        this.parseExponentiationExpression
                      );
                    t = this.finalize(
                      this.startNode(e),
                      new o.BinaryExpression("**", n, r)
                    );
                  }
                  return t;
                }),
                (e.prototype.binaryPrecedence = function (e) {
                  var t = e.value;
                  return 7 === e.type
                    ? this.operatorPrecedence[t] || 0
                    : 4 === e.type &&
                      ("instanceof" === t ||
                        (this.context.allowIn && "in" === t))
                    ? 7
                    : 0;
                }),
                (e.prototype.parseBinaryExpression = function () {
                  var e = this.lookahead,
                    t = this.inheritCoverGrammar(
                      this.parseExponentiationExpression
                    ),
                    n = this.lookahead,
                    r = this.binaryPrecedence(n);
                  if (r > 0) {
                    this.nextToken(),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                    for (
                      var i = [e, this.lookahead],
                        s = t,
                        a = this.isolateCoverGrammar(
                          this.parseExponentiationExpression
                        ),
                        u = [s, n.value, a],
                        c = [r];
                      !((r = this.binaryPrecedence(this.lookahead)) <= 0);

                    ) {
                      for (; u.length > 2 && r <= c[c.length - 1]; ) {
                        a = u.pop();
                        var l = u.pop();
                        c.pop(), (s = u.pop()), i.pop();
                        var h = this.startNode(i[i.length - 1]);
                        u.push(
                          this.finalize(h, new o.BinaryExpression(l, s, a))
                        );
                      }
                      u.push(this.nextToken().value),
                        c.push(r),
                        i.push(this.lookahead),
                        u.push(
                          this.isolateCoverGrammar(
                            this.parseExponentiationExpression
                          )
                        );
                    }
                    var d = u.length - 1;
                    t = u[d];
                    for (var p = i.pop(); d > 1; ) {
                      var f = i.pop(),
                        m = p && p.lineStart;
                      (h = this.startNode(f, m)),
                        (l = u[d - 1]),
                        (t = this.finalize(
                          h,
                          new o.BinaryExpression(l, u[d - 2], t)
                        )),
                        (d -= 2),
                        (p = f);
                    }
                  }
                  return t;
                }),
                (e.prototype.parseConditionalExpression = function () {
                  var e = this.lookahead,
                    t = this.inheritCoverGrammar(this.parseBinaryExpression);
                  if (this.match("?")) {
                    this.nextToken();
                    var n = this.context.allowIn;
                    this.context.allowIn = !0;
                    var r = this.isolateCoverGrammar(
                      this.parseAssignmentExpression
                    );
                    (this.context.allowIn = n), this.expect(":");
                    var i = this.isolateCoverGrammar(
                      this.parseAssignmentExpression
                    );
                    (t = this.finalize(
                      this.startNode(e),
                      new o.ConditionalExpression(t, r, i)
                    )),
                      (this.context.isAssignmentTarget = !1),
                      (this.context.isBindingElement = !1);
                  }
                  return t;
                }),
                (e.prototype.checkPatternParam = function (e, t) {
                  switch (t.type) {
                    case u.Syntax.Identifier:
                      this.validateParam(e, t, t.name);
                      break;
                    case u.Syntax.RestElement:
                      this.checkPatternParam(e, t.argument);
                      break;
                    case u.Syntax.AssignmentPattern:
                      this.checkPatternParam(e, t.left);
                      break;
                    case u.Syntax.ArrayPattern:
                      for (var n = 0; n < t.elements.length; n++)
                        null !== t.elements[n] &&
                          this.checkPatternParam(e, t.elements[n]);
                      break;
                    case u.Syntax.ObjectPattern:
                      for (n = 0; n < t.properties.length; n++)
                        this.checkPatternParam(e, t.properties[n].value);
                  }
                  e.simple = e.simple && t instanceof o.Identifier;
                }),
                (e.prototype.reinterpretAsCoverFormalsList = function (e) {
                  var t,
                    n = [e],
                    r = !1;
                  switch (e.type) {
                    case u.Syntax.Identifier:
                      break;
                    case "ArrowParameterPlaceHolder":
                      (n = e.params), (r = e.async);
                      break;
                    default:
                      return null;
                  }
                  t = { simple: !0, paramSet: {} };
                  for (var i = 0; i < n.length; ++i)
                    (o = n[i]).type === u.Syntax.AssignmentPattern
                      ? o.right.type === u.Syntax.YieldExpression &&
                        (o.right.argument &&
                          this.throwUnexpectedToken(this.lookahead),
                        (o.right.type = u.Syntax.Identifier),
                        (o.right.name = "yield"),
                        delete o.right.argument,
                        delete o.right.delegate)
                      : r &&
                        o.type === u.Syntax.Identifier &&
                        "await" === o.name &&
                        this.throwUnexpectedToken(this.lookahead),
                      this.checkPatternParam(t, o),
                      (n[i] = o);
                  if (this.context.strict || !this.context.allowYield)
                    for (i = 0; i < n.length; ++i) {
                      var o;
                      (o = n[i]).type === u.Syntax.YieldExpression &&
                        this.throwUnexpectedToken(this.lookahead);
                    }
                  if (t.message === s.Messages.StrictParamDupe) {
                    var a = this.context.strict
                      ? t.stricted
                      : t.firstRestricted;
                    this.throwUnexpectedToken(a, t.message);
                  }
                  return {
                    simple: t.simple,
                    params: n,
                    stricted: t.stricted,
                    firstRestricted: t.firstRestricted,
                    message: t.message,
                  };
                }),
                (e.prototype.parseAssignmentExpression = function () {
                  var e;
                  if (!this.context.allowYield && this.matchKeyword("yield"))
                    e = this.parseYieldExpression();
                  else {
                    var t = this.lookahead,
                      n = t;
                    if (
                      ((e = this.parseConditionalExpression()),
                      3 === n.type &&
                        n.lineNumber === this.lookahead.lineNumber &&
                        "async" === n.value &&
                        (3 === this.lookahead.type ||
                          this.matchKeyword("yield")))
                    ) {
                      var r = this.parsePrimaryExpression();
                      this.reinterpretExpressionAsPattern(r),
                        (e = {
                          type: "ArrowParameterPlaceHolder",
                          params: [r],
                          async: !0,
                        });
                    }
                    if (
                      "ArrowParameterPlaceHolder" === e.type ||
                      this.match("=>")
                    ) {
                      (this.context.isAssignmentTarget = !1),
                        (this.context.isBindingElement = !1);
                      var i = e.async,
                        a = this.reinterpretAsCoverFormalsList(e);
                      if (a) {
                        this.hasLineTerminator &&
                          this.tolerateUnexpectedToken(this.lookahead),
                          (this.context.firstCoverInitializedNameError = null);
                        var c = this.context.strict,
                          l = this.context.allowStrictDirective;
                        this.context.allowStrictDirective = a.simple;
                        var h = this.context.allowYield,
                          d = this.context.await;
                        (this.context.allowYield = !0),
                          (this.context.await = i);
                        var p = this.startNode(t);
                        this.expect("=>");
                        var f = void 0;
                        if (this.match("{")) {
                          var m = this.context.allowIn;
                          (this.context.allowIn = !0),
                            (f = this.parseFunctionSourceElements()),
                            (this.context.allowIn = m);
                        } else
                          f = this.isolateCoverGrammar(
                            this.parseAssignmentExpression
                          );
                        var g = f.type !== u.Syntax.BlockStatement;
                        this.context.strict &&
                          a.firstRestricted &&
                          this.throwUnexpectedToken(
                            a.firstRestricted,
                            a.message
                          ),
                          this.context.strict &&
                            a.stricted &&
                            this.tolerateUnexpectedToken(a.stricted, a.message),
                          (e = i
                            ? this.finalize(
                                p,
                                new o.AsyncArrowFunctionExpression(
                                  a.params,
                                  f,
                                  g
                                )
                              )
                            : this.finalize(
                                p,
                                new o.ArrowFunctionExpression(a.params, f, g)
                              )),
                          (this.context.strict = c),
                          (this.context.allowStrictDirective = l),
                          (this.context.allowYield = h),
                          (this.context.await = d);
                      }
                    } else if (this.matchAssign()) {
                      if (
                        (this.context.isAssignmentTarget ||
                          this.tolerateError(s.Messages.InvalidLHSInAssignment),
                        this.context.strict && e.type === u.Syntax.Identifier)
                      ) {
                        var y = e;
                        this.scanner.isRestrictedWord(y.name) &&
                          this.tolerateUnexpectedToken(
                            n,
                            s.Messages.StrictLHSAssignment
                          ),
                          this.scanner.isStrictModeReservedWord(y.name) &&
                            this.tolerateUnexpectedToken(
                              n,
                              s.Messages.StrictReservedWord
                            );
                      }
                      this.match("=")
                        ? this.reinterpretExpressionAsPattern(e)
                        : ((this.context.isAssignmentTarget = !1),
                          (this.context.isBindingElement = !1));
                      var v = (n = this.nextToken()).value,
                        E = this.isolateCoverGrammar(
                          this.parseAssignmentExpression
                        );
                      (e = this.finalize(
                        this.startNode(t),
                        new o.AssignmentExpression(v, e, E)
                      )),
                        (this.context.firstCoverInitializedNameError = null);
                    }
                  }
                  return e;
                }),
                (e.prototype.parseExpression = function () {
                  var e = this.lookahead,
                    t = this.isolateCoverGrammar(
                      this.parseAssignmentExpression
                    );
                  if (this.match(",")) {
                    var n = [];
                    for (
                      n.push(t);
                      2 !== this.lookahead.type && this.match(",");

                    )
                      this.nextToken(),
                        n.push(
                          this.isolateCoverGrammar(
                            this.parseAssignmentExpression
                          )
                        );
                    t = this.finalize(
                      this.startNode(e),
                      new o.SequenceExpression(n)
                    );
                  }
                  return t;
                }),
                (e.prototype.parseStatementListItem = function () {
                  var e;
                  if (
                    ((this.context.isAssignmentTarget = !0),
                    (this.context.isBindingElement = !0),
                    4 === this.lookahead.type)
                  )
                    switch (this.lookahead.value) {
                      case "export":
                        this.context.isModule ||
                          this.tolerateUnexpectedToken(
                            this.lookahead,
                            s.Messages.IllegalExportDeclaration
                          ),
                          (e = this.parseExportDeclaration());
                        break;
                      case "import":
                        this.context.isModule ||
                          this.tolerateUnexpectedToken(
                            this.lookahead,
                            s.Messages.IllegalImportDeclaration
                          ),
                          (e = this.parseImportDeclaration());
                        break;
                      case "const":
                        e = this.parseLexicalDeclaration({ inFor: !1 });
                        break;
                      case "function":
                        e = this.parseFunctionDeclaration();
                        break;
                      case "class":
                        e = this.parseClassDeclaration();
                        break;
                      case "let":
                        e = this.isLexicalDeclaration()
                          ? this.parseLexicalDeclaration({ inFor: !1 })
                          : this.parseStatement();
                        break;
                      default:
                        e = this.parseStatement();
                    }
                  else e = this.parseStatement();
                  return e;
                }),
                (e.prototype.parseBlock = function () {
                  var e = this.createNode();
                  this.expect("{");
                  for (var t = []; !this.match("}"); )
                    t.push(this.parseStatementListItem());
                  return (
                    this.expect("}"), this.finalize(e, new o.BlockStatement(t))
                  );
                }),
                (e.prototype.parseLexicalBinding = function (e, t) {
                  var n = this.createNode(),
                    r = this.parsePattern([], e);
                  this.context.strict &&
                    r.type === u.Syntax.Identifier &&
                    this.scanner.isRestrictedWord(r.name) &&
                    this.tolerateError(s.Messages.StrictVarName);
                  var i = null;
                  return (
                    "const" === e
                      ? this.matchKeyword("in") ||
                        this.matchContextualKeyword("of") ||
                        (this.match("=")
                          ? (this.nextToken(),
                            (i = this.isolateCoverGrammar(
                              this.parseAssignmentExpression
                            )))
                          : this.throwError(
                              s.Messages.DeclarationMissingInitializer,
                              "const"
                            ))
                      : ((!t.inFor && r.type !== u.Syntax.Identifier) ||
                          this.match("=")) &&
                        (this.expect("="),
                        (i = this.isolateCoverGrammar(
                          this.parseAssignmentExpression
                        ))),
                    this.finalize(n, new o.VariableDeclarator(r, i))
                  );
                }),
                (e.prototype.parseBindingList = function (e, t) {
                  for (
                    var n = [this.parseLexicalBinding(e, t)];
                    this.match(",");

                  )
                    this.nextToken(), n.push(this.parseLexicalBinding(e, t));
                  return n;
                }),
                (e.prototype.isLexicalDeclaration = function () {
                  var e = this.scanner.saveState();
                  this.scanner.scanComments();
                  var t = this.scanner.lex();
                  return (
                    this.scanner.restoreState(e),
                    3 === t.type ||
                      (7 === t.type && "[" === t.value) ||
                      (7 === t.type && "{" === t.value) ||
                      (4 === t.type && "let" === t.value) ||
                      (4 === t.type && "yield" === t.value)
                  );
                }),
                (e.prototype.parseLexicalDeclaration = function (e) {
                  var t = this.createNode(),
                    n = this.nextToken().value;
                  r.assert(
                    "let" === n || "const" === n,
                    "Lexical declaration must be either let or const"
                  );
                  var i = this.parseBindingList(n, e);
                  return (
                    this.consumeSemicolon(),
                    this.finalize(t, new o.VariableDeclaration(i, n))
                  );
                }),
                (e.prototype.parseBindingRestElement = function (e, t) {
                  var n = this.createNode();
                  this.expect("...");
                  var r = this.parsePattern(e, t);
                  return this.finalize(n, new o.RestElement(r));
                }),
                (e.prototype.parseArrayPattern = function (e, t) {
                  var n = this.createNode();
                  this.expect("[");
                  for (var r = []; !this.match("]"); )
                    if (this.match(",")) this.nextToken(), r.push(null);
                    else {
                      if (this.match("...")) {
                        r.push(this.parseBindingRestElement(e, t));
                        break;
                      }
                      r.push(this.parsePatternWithDefault(e, t)),
                        this.match("]") || this.expect(",");
                    }
                  return (
                    this.expect("]"), this.finalize(n, new o.ArrayPattern(r))
                  );
                }),
                (e.prototype.parsePropertyPattern = function (e, t) {
                  var n,
                    r,
                    i = this.createNode(),
                    s = !1,
                    a = !1;
                  if (3 === this.lookahead.type) {
                    var u = this.lookahead;
                    n = this.parseVariableIdentifier();
                    var c = this.finalize(i, new o.Identifier(u.value));
                    if (this.match("=")) {
                      e.push(u), (a = !0), this.nextToken();
                      var l = this.parseAssignmentExpression();
                      r = this.finalize(
                        this.startNode(u),
                        new o.AssignmentPattern(c, l)
                      );
                    } else
                      this.match(":")
                        ? (this.expect(":"),
                          (r = this.parsePatternWithDefault(e, t)))
                        : (e.push(u), (a = !0), (r = c));
                  } else
                    (s = this.match("[")),
                      (n = this.parseObjectPropertyKey()),
                      this.expect(":"),
                      (r = this.parsePatternWithDefault(e, t));
                  return this.finalize(
                    i,
                    new o.Property("init", n, s, r, !1, a)
                  );
                }),
                (e.prototype.parseObjectPattern = function (e, t) {
                  var n = this.createNode(),
                    r = [];
                  for (this.expect("{"); !this.match("}"); )
                    r.push(this.parsePropertyPattern(e, t)),
                      this.match("}") || this.expect(",");
                  return (
                    this.expect("}"), this.finalize(n, new o.ObjectPattern(r))
                  );
                }),
                (e.prototype.parsePattern = function (e, t) {
                  var n;
                  return (
                    this.match("[")
                      ? (n = this.parseArrayPattern(e, t))
                      : this.match("{")
                      ? (n = this.parseObjectPattern(e, t))
                      : (!this.matchKeyword("let") ||
                          ("const" !== t && "let" !== t) ||
                          this.tolerateUnexpectedToken(
                            this.lookahead,
                            s.Messages.LetInLexicalBinding
                          ),
                        e.push(this.lookahead),
                        (n = this.parseVariableIdentifier(t))),
                    n
                  );
                }),
                (e.prototype.parsePatternWithDefault = function (e, t) {
                  var n = this.lookahead,
                    r = this.parsePattern(e, t);
                  if (this.match("=")) {
                    this.nextToken();
                    var i = this.context.allowYield;
                    this.context.allowYield = !0;
                    var s = this.isolateCoverGrammar(
                      this.parseAssignmentExpression
                    );
                    (this.context.allowYield = i),
                      (r = this.finalize(
                        this.startNode(n),
                        new o.AssignmentPattern(r, s)
                      ));
                  }
                  return r;
                }),
                (e.prototype.parseVariableIdentifier = function (e) {
                  var t = this.createNode(),
                    n = this.nextToken();
                  return (
                    4 === n.type && "yield" === n.value
                      ? this.context.strict
                        ? this.tolerateUnexpectedToken(
                            n,
                            s.Messages.StrictReservedWord
                          )
                        : this.context.allowYield ||
                          this.throwUnexpectedToken(n)
                      : 3 !== n.type
                      ? this.context.strict &&
                        4 === n.type &&
                        this.scanner.isStrictModeReservedWord(n.value)
                        ? this.tolerateUnexpectedToken(
                            n,
                            s.Messages.StrictReservedWord
                          )
                        : (this.context.strict ||
                            "let" !== n.value ||
                            "var" !== e) &&
                          this.throwUnexpectedToken(n)
                      : (this.context.isModule || this.context.await) &&
                        3 === n.type &&
                        "await" === n.value &&
                        this.tolerateUnexpectedToken(n),
                    this.finalize(t, new o.Identifier(n.value))
                  );
                }),
                (e.prototype.parseVariableDeclaration = function (e) {
                  var t = this.createNode(),
                    n = this.parsePattern([], "var");
                  this.context.strict &&
                    n.type === u.Syntax.Identifier &&
                    this.scanner.isRestrictedWord(n.name) &&
                    this.tolerateError(s.Messages.StrictVarName);
                  var r = null;
                  return (
                    this.match("=")
                      ? (this.nextToken(),
                        (r = this.isolateCoverGrammar(
                          this.parseAssignmentExpression
                        )))
                      : n.type === u.Syntax.Identifier ||
                        e.inFor ||
                        this.expect("="),
                    this.finalize(t, new o.VariableDeclarator(n, r))
                  );
                }),
                (e.prototype.parseVariableDeclarationList = function (e) {
                  var t = { inFor: e.inFor },
                    n = [];
                  for (
                    n.push(this.parseVariableDeclaration(t));
                    this.match(",");

                  )
                    this.nextToken(), n.push(this.parseVariableDeclaration(t));
                  return n;
                }),
                (e.prototype.parseVariableStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("var");
                  var t = this.parseVariableDeclarationList({ inFor: !1 });
                  return (
                    this.consumeSemicolon(),
                    this.finalize(e, new o.VariableDeclaration(t, "var"))
                  );
                }),
                (e.prototype.parseEmptyStatement = function () {
                  var e = this.createNode();
                  return (
                    this.expect(";"), this.finalize(e, new o.EmptyStatement())
                  );
                }),
                (e.prototype.parseExpressionStatement = function () {
                  var e = this.createNode(),
                    t = this.parseExpression();
                  return (
                    this.consumeSemicolon(),
                    this.finalize(e, new o.ExpressionStatement(t))
                  );
                }),
                (e.prototype.parseIfClause = function () {
                  return (
                    this.context.strict &&
                      this.matchKeyword("function") &&
                      this.tolerateError(s.Messages.StrictFunction),
                    this.parseStatement()
                  );
                }),
                (e.prototype.parseIfStatement = function () {
                  var e,
                    t = this.createNode(),
                    n = null;
                  this.expectKeyword("if"), this.expect("(");
                  var r = this.parseExpression();
                  return (
                    !this.match(")") && this.config.tolerant
                      ? (this.tolerateUnexpectedToken(this.nextToken()),
                        (e = this.finalize(
                          this.createNode(),
                          new o.EmptyStatement()
                        )))
                      : (this.expect(")"),
                        (e = this.parseIfClause()),
                        this.matchKeyword("else") &&
                          (this.nextToken(), (n = this.parseIfClause()))),
                    this.finalize(t, new o.IfStatement(r, e, n))
                  );
                }),
                (e.prototype.parseDoWhileStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("do");
                  var t = this.context.inIteration;
                  this.context.inIteration = !0;
                  var n = this.parseStatement();
                  (this.context.inIteration = t),
                    this.expectKeyword("while"),
                    this.expect("(");
                  var r = this.parseExpression();
                  return (
                    !this.match(")") && this.config.tolerant
                      ? this.tolerateUnexpectedToken(this.nextToken())
                      : (this.expect(")"), this.match(";") && this.nextToken()),
                    this.finalize(e, new o.DoWhileStatement(n, r))
                  );
                }),
                (e.prototype.parseWhileStatement = function () {
                  var e,
                    t = this.createNode();
                  this.expectKeyword("while"), this.expect("(");
                  var n = this.parseExpression();
                  if (!this.match(")") && this.config.tolerant)
                    this.tolerateUnexpectedToken(this.nextToken()),
                      (e = this.finalize(
                        this.createNode(),
                        new o.EmptyStatement()
                      ));
                  else {
                    this.expect(")");
                    var r = this.context.inIteration;
                    (this.context.inIteration = !0),
                      (e = this.parseStatement()),
                      (this.context.inIteration = r);
                  }
                  return this.finalize(t, new o.WhileStatement(n, e));
                }),
                (e.prototype.parseForStatement = function () {
                  var e,
                    t,
                    n,
                    r = null,
                    i = null,
                    a = null,
                    c = !0,
                    l = this.createNode();
                  if (
                    (this.expectKeyword("for"),
                    this.expect("("),
                    this.match(";"))
                  )
                    this.nextToken();
                  else if (this.matchKeyword("var")) {
                    (r = this.createNode()), this.nextToken();
                    var h = this.context.allowIn;
                    this.context.allowIn = !1;
                    var d = this.parseVariableDeclarationList({ inFor: !0 });
                    if (
                      ((this.context.allowIn = h),
                      1 === d.length && this.matchKeyword("in"))
                    ) {
                      var p = d[0];
                      p.init &&
                        (p.id.type === u.Syntax.ArrayPattern ||
                          p.id.type === u.Syntax.ObjectPattern ||
                          this.context.strict) &&
                        this.tolerateError(
                          s.Messages.ForInOfLoopInitializer,
                          "for-in"
                        ),
                        (r = this.finalize(
                          r,
                          new o.VariableDeclaration(d, "var")
                        )),
                        this.nextToken(),
                        (e = r),
                        (t = this.parseExpression()),
                        (r = null);
                    } else
                      1 === d.length &&
                      null === d[0].init &&
                      this.matchContextualKeyword("of")
                        ? ((r = this.finalize(
                            r,
                            new o.VariableDeclaration(d, "var")
                          )),
                          this.nextToken(),
                          (e = r),
                          (t = this.parseAssignmentExpression()),
                          (r = null),
                          (c = !1))
                        : ((r = this.finalize(
                            r,
                            new o.VariableDeclaration(d, "var")
                          )),
                          this.expect(";"));
                  } else if (
                    this.matchKeyword("const") ||
                    this.matchKeyword("let")
                  ) {
                    r = this.createNode();
                    var f = this.nextToken().value;
                    this.context.strict || "in" !== this.lookahead.value
                      ? ((h = this.context.allowIn),
                        (this.context.allowIn = !1),
                        (d = this.parseBindingList(f, { inFor: !0 })),
                        (this.context.allowIn = h),
                        1 === d.length &&
                        null === d[0].init &&
                        this.matchKeyword("in")
                          ? ((r = this.finalize(
                              r,
                              new o.VariableDeclaration(d, f)
                            )),
                            this.nextToken(),
                            (e = r),
                            (t = this.parseExpression()),
                            (r = null))
                          : 1 === d.length &&
                            null === d[0].init &&
                            this.matchContextualKeyword("of")
                          ? ((r = this.finalize(
                              r,
                              new o.VariableDeclaration(d, f)
                            )),
                            this.nextToken(),
                            (e = r),
                            (t = this.parseAssignmentExpression()),
                            (r = null),
                            (c = !1))
                          : (this.consumeSemicolon(),
                            (r = this.finalize(
                              r,
                              new o.VariableDeclaration(d, f)
                            ))))
                      : ((r = this.finalize(r, new o.Identifier(f))),
                        this.nextToken(),
                        (e = r),
                        (t = this.parseExpression()),
                        (r = null));
                  } else {
                    var m = this.lookahead;
                    if (
                      ((h = this.context.allowIn),
                      (this.context.allowIn = !1),
                      (r = this.inheritCoverGrammar(
                        this.parseAssignmentExpression
                      )),
                      (this.context.allowIn = h),
                      this.matchKeyword("in"))
                    )
                      (this.context.isAssignmentTarget &&
                        r.type !== u.Syntax.AssignmentExpression) ||
                        this.tolerateError(s.Messages.InvalidLHSInForIn),
                        this.nextToken(),
                        this.reinterpretExpressionAsPattern(r),
                        (e = r),
                        (t = this.parseExpression()),
                        (r = null);
                    else if (this.matchContextualKeyword("of"))
                      (this.context.isAssignmentTarget &&
                        r.type !== u.Syntax.AssignmentExpression) ||
                        this.tolerateError(s.Messages.InvalidLHSInForLoop),
                        this.nextToken(),
                        this.reinterpretExpressionAsPattern(r),
                        (e = r),
                        (t = this.parseAssignmentExpression()),
                        (r = null),
                        (c = !1);
                    else {
                      if (this.match(",")) {
                        for (var g = [r]; this.match(","); )
                          this.nextToken(),
                            g.push(
                              this.isolateCoverGrammar(
                                this.parseAssignmentExpression
                              )
                            );
                        r = this.finalize(
                          this.startNode(m),
                          new o.SequenceExpression(g)
                        );
                      }
                      this.expect(";");
                    }
                  }
                  if (
                    (void 0 === e &&
                      (this.match(";") || (i = this.parseExpression()),
                      this.expect(";"),
                      this.match(")") || (a = this.parseExpression())),
                    !this.match(")") && this.config.tolerant)
                  )
                    this.tolerateUnexpectedToken(this.nextToken()),
                      (n = this.finalize(
                        this.createNode(),
                        new o.EmptyStatement()
                      ));
                  else {
                    this.expect(")");
                    var y = this.context.inIteration;
                    (this.context.inIteration = !0),
                      (n = this.isolateCoverGrammar(this.parseStatement)),
                      (this.context.inIteration = y);
                  }
                  return void 0 === e
                    ? this.finalize(l, new o.ForStatement(r, i, a, n))
                    : c
                    ? this.finalize(l, new o.ForInStatement(e, t, n))
                    : this.finalize(l, new o.ForOfStatement(e, t, n));
                }),
                (e.prototype.parseContinueStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("continue");
                  var t = null;
                  if (3 === this.lookahead.type && !this.hasLineTerminator) {
                    var n = this.parseVariableIdentifier();
                    t = n;
                    var r = "$" + n.name;
                    Object.prototype.hasOwnProperty.call(
                      this.context.labelSet,
                      r
                    ) || this.throwError(s.Messages.UnknownLabel, n.name);
                  }
                  return (
                    this.consumeSemicolon(),
                    null !== t ||
                      this.context.inIteration ||
                      this.throwError(s.Messages.IllegalContinue),
                    this.finalize(e, new o.ContinueStatement(t))
                  );
                }),
                (e.prototype.parseBreakStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("break");
                  var t = null;
                  if (3 === this.lookahead.type && !this.hasLineTerminator) {
                    var n = this.parseVariableIdentifier(),
                      r = "$" + n.name;
                    Object.prototype.hasOwnProperty.call(
                      this.context.labelSet,
                      r
                    ) || this.throwError(s.Messages.UnknownLabel, n.name),
                      (t = n);
                  }
                  return (
                    this.consumeSemicolon(),
                    null !== t ||
                      this.context.inIteration ||
                      this.context.inSwitch ||
                      this.throwError(s.Messages.IllegalBreak),
                    this.finalize(e, new o.BreakStatement(t))
                  );
                }),
                (e.prototype.parseReturnStatement = function () {
                  this.context.inFunctionBody ||
                    this.tolerateError(s.Messages.IllegalReturn);
                  var e = this.createNode();
                  this.expectKeyword("return");
                  var t =
                    (this.match(";") ||
                      this.match("}") ||
                      this.hasLineTerminator ||
                      2 === this.lookahead.type) &&
                    8 !== this.lookahead.type &&
                    10 !== this.lookahead.type
                      ? null
                      : this.parseExpression();
                  return (
                    this.consumeSemicolon(),
                    this.finalize(e, new o.ReturnStatement(t))
                  );
                }),
                (e.prototype.parseWithStatement = function () {
                  this.context.strict &&
                    this.tolerateError(s.Messages.StrictModeWith);
                  var e,
                    t = this.createNode();
                  this.expectKeyword("with"), this.expect("(");
                  var n = this.parseExpression();
                  return (
                    !this.match(")") && this.config.tolerant
                      ? (this.tolerateUnexpectedToken(this.nextToken()),
                        (e = this.finalize(
                          this.createNode(),
                          new o.EmptyStatement()
                        )))
                      : (this.expect(")"), (e = this.parseStatement())),
                    this.finalize(t, new o.WithStatement(n, e))
                  );
                }),
                (e.prototype.parseSwitchCase = function () {
                  var e,
                    t = this.createNode();
                  this.matchKeyword("default")
                    ? (this.nextToken(), (e = null))
                    : (this.expectKeyword("case"),
                      (e = this.parseExpression())),
                    this.expect(":");
                  for (
                    var n = [];
                    !(
                      this.match("}") ||
                      this.matchKeyword("default") ||
                      this.matchKeyword("case")
                    );

                  )
                    n.push(this.parseStatementListItem());
                  return this.finalize(t, new o.SwitchCase(e, n));
                }),
                (e.prototype.parseSwitchStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("switch"), this.expect("(");
                  var t = this.parseExpression();
                  this.expect(")");
                  var n = this.context.inSwitch;
                  this.context.inSwitch = !0;
                  var r = [],
                    i = !1;
                  for (this.expect("{"); !this.match("}"); ) {
                    var a = this.parseSwitchCase();
                    null === a.test &&
                      (i &&
                        this.throwError(s.Messages.MultipleDefaultsInSwitch),
                      (i = !0)),
                      r.push(a);
                  }
                  return (
                    this.expect("}"),
                    (this.context.inSwitch = n),
                    this.finalize(e, new o.SwitchStatement(t, r))
                  );
                }),
                (e.prototype.parseLabelledStatement = function () {
                  var e,
                    t = this.createNode(),
                    n = this.parseExpression();
                  if (n.type === u.Syntax.Identifier && this.match(":")) {
                    this.nextToken();
                    var r = n,
                      i = "$" + r.name;
                    Object.prototype.hasOwnProperty.call(
                      this.context.labelSet,
                      i
                    ) &&
                      this.throwError(
                        s.Messages.Redeclaration,
                        "Label",
                        r.name
                      ),
                      (this.context.labelSet[i] = !0);
                    var a = void 0;
                    if (this.matchKeyword("class"))
                      this.tolerateUnexpectedToken(this.lookahead),
                        (a = this.parseClassDeclaration());
                    else if (this.matchKeyword("function")) {
                      var c = this.lookahead,
                        l = this.parseFunctionDeclaration();
                      this.context.strict
                        ? this.tolerateUnexpectedToken(
                            c,
                            s.Messages.StrictFunction
                          )
                        : l.generator &&
                          this.tolerateUnexpectedToken(
                            c,
                            s.Messages.GeneratorInLegacyContext
                          ),
                        (a = l);
                    } else a = this.parseStatement();
                    delete this.context.labelSet[i],
                      (e = new o.LabeledStatement(r, a));
                  } else
                    this.consumeSemicolon(), (e = new o.ExpressionStatement(n));
                  return this.finalize(t, e);
                }),
                (e.prototype.parseThrowStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("throw"),
                    this.hasLineTerminator &&
                      this.throwError(s.Messages.NewlineAfterThrow);
                  var t = this.parseExpression();
                  return (
                    this.consumeSemicolon(),
                    this.finalize(e, new o.ThrowStatement(t))
                  );
                }),
                (e.prototype.parseCatchClause = function () {
                  var e = this.createNode();
                  this.expectKeyword("catch"),
                    this.expect("("),
                    this.match(")") &&
                      this.throwUnexpectedToken(this.lookahead);
                  for (
                    var t = [], n = this.parsePattern(t), r = {}, i = 0;
                    i < t.length;
                    i++
                  ) {
                    var a = "$" + t[i].value;
                    Object.prototype.hasOwnProperty.call(r, a) &&
                      this.tolerateError(
                        s.Messages.DuplicateBinding,
                        t[i].value
                      ),
                      (r[a] = !0);
                  }
                  this.context.strict &&
                    n.type === u.Syntax.Identifier &&
                    this.scanner.isRestrictedWord(n.name) &&
                    this.tolerateError(s.Messages.StrictCatchVariable),
                    this.expect(")");
                  var c = this.parseBlock();
                  return this.finalize(e, new o.CatchClause(n, c));
                }),
                (e.prototype.parseFinallyClause = function () {
                  return this.expectKeyword("finally"), this.parseBlock();
                }),
                (e.prototype.parseTryStatement = function () {
                  var e = this.createNode();
                  this.expectKeyword("try");
                  var t = this.parseBlock(),
                    n = this.matchKeyword("catch")
                      ? this.parseCatchClause()
                      : null,
                    r = this.matchKeyword("finally")
                      ? this.parseFinallyClause()
                      : null;
                  return (
                    n || r || this.throwError(s.Messages.NoCatchOrFinally),
                    this.finalize(e, new o.TryStatement(t, n, r))
                  );
                }),
                (e.prototype.parseDebuggerStatement = function () {
                  var e = this.createNode();
                  return (
                    this.expectKeyword("debugger"),
                    this.consumeSemicolon(),
                    this.finalize(e, new o.DebuggerStatement())
                  );
                }),
                (e.prototype.parseStatement = function () {
                  var e;
                  switch (this.lookahead.type) {
                    case 1:
                    case 5:
                    case 6:
                    case 8:
                    case 10:
                    case 9:
                      e = this.parseExpressionStatement();
                      break;
                    case 7:
                      var t = this.lookahead.value;
                      e =
                        "{" === t
                          ? this.parseBlock()
                          : "(" === t
                          ? this.parseExpressionStatement()
                          : ";" === t
                          ? this.parseEmptyStatement()
                          : this.parseExpressionStatement();
                      break;
                    case 3:
                      e = this.matchAsyncFunction()
                        ? this.parseFunctionDeclaration()
                        : this.parseLabelledStatement();
                      break;
                    case 4:
                      switch (this.lookahead.value) {
                        case "break":
                          e = this.parseBreakStatement();
                          break;
                        case "continue":
                          e = this.parseContinueStatement();
                          break;
                        case "debugger":
                          e = this.parseDebuggerStatement();
                          break;
                        case "do":
                          e = this.parseDoWhileStatement();
                          break;
                        case "for":
                          e = this.parseForStatement();
                          break;
                        case "function":
                          e = this.parseFunctionDeclaration();
                          break;
                        case "if":
                          e = this.parseIfStatement();
                          break;
                        case "return":
                          e = this.parseReturnStatement();
                          break;
                        case "switch":
                          e = this.parseSwitchStatement();
                          break;
                        case "throw":
                          e = this.parseThrowStatement();
                          break;
                        case "try":
                          e = this.parseTryStatement();
                          break;
                        case "var":
                          e = this.parseVariableStatement();
                          break;
                        case "while":
                          e = this.parseWhileStatement();
                          break;
                        case "with":
                          e = this.parseWithStatement();
                          break;
                        default:
                          e = this.parseExpressionStatement();
                      }
                      break;
                    default:
                      e = this.throwUnexpectedToken(this.lookahead);
                  }
                  return e;
                }),
                (e.prototype.parseFunctionSourceElements = function () {
                  var e = this.createNode();
                  this.expect("{");
                  var t = this.parseDirectivePrologues(),
                    n = this.context.labelSet,
                    r = this.context.inIteration,
                    i = this.context.inSwitch,
                    s = this.context.inFunctionBody;
                  for (
                    this.context.labelSet = {},
                      this.context.inIteration = !1,
                      this.context.inSwitch = !1,
                      this.context.inFunctionBody = !0;
                    2 !== this.lookahead.type && !this.match("}");

                  )
                    t.push(this.parseStatementListItem());
                  return (
                    this.expect("}"),
                    (this.context.labelSet = n),
                    (this.context.inIteration = r),
                    (this.context.inSwitch = i),
                    (this.context.inFunctionBody = s),
                    this.finalize(e, new o.BlockStatement(t))
                  );
                }),
                (e.prototype.validateParam = function (e, t, n) {
                  var r = "$" + n;
                  this.context.strict
                    ? (this.scanner.isRestrictedWord(n) &&
                        ((e.stricted = t),
                        (e.message = s.Messages.StrictParamName)),
                      Object.prototype.hasOwnProperty.call(e.paramSet, r) &&
                        ((e.stricted = t),
                        (e.message = s.Messages.StrictParamDupe)))
                    : e.firstRestricted ||
                      (this.scanner.isRestrictedWord(n)
                        ? ((e.firstRestricted = t),
                          (e.message = s.Messages.StrictParamName))
                        : this.scanner.isStrictModeReservedWord(n)
                        ? ((e.firstRestricted = t),
                          (e.message = s.Messages.StrictReservedWord))
                        : Object.prototype.hasOwnProperty.call(e.paramSet, r) &&
                          ((e.stricted = t),
                          (e.message = s.Messages.StrictParamDupe))),
                    "function" == typeof Object.defineProperty
                      ? Object.defineProperty(e.paramSet, r, {
                          value: !0,
                          enumerable: !0,
                          writable: !0,
                          configurable: !0,
                        })
                      : (e.paramSet[r] = !0);
                }),
                (e.prototype.parseRestElement = function (e) {
                  var t = this.createNode();
                  this.expect("...");
                  var n = this.parsePattern(e);
                  return (
                    this.match("=") &&
                      this.throwError(s.Messages.DefaultRestParameter),
                    this.match(")") ||
                      this.throwError(s.Messages.ParameterAfterRestParameter),
                    this.finalize(t, new o.RestElement(n))
                  );
                }),
                (e.prototype.parseFormalParameter = function (e) {
                  for (
                    var t = [],
                      n = this.match("...")
                        ? this.parseRestElement(t)
                        : this.parsePatternWithDefault(t),
                      r = 0;
                    r < t.length;
                    r++
                  )
                    this.validateParam(e, t[r], t[r].value);
                  (e.simple = e.simple && n instanceof o.Identifier),
                    e.params.push(n);
                }),
                (e.prototype.parseFormalParameters = function (e) {
                  var t;
                  if (
                    ((t = { simple: !0, params: [], firstRestricted: e }),
                    this.expect("("),
                    !this.match(")"))
                  )
                    for (
                      t.paramSet = {};
                      2 !== this.lookahead.type &&
                      (this.parseFormalParameter(t), !this.match(")")) &&
                      (this.expect(","), !this.match(")"));

                    );
                  return (
                    this.expect(")"),
                    {
                      simple: t.simple,
                      params: t.params,
                      stricted: t.stricted,
                      firstRestricted: t.firstRestricted,
                      message: t.message,
                    }
                  );
                }),
                (e.prototype.matchAsyncFunction = function () {
                  var e = this.matchContextualKeyword("async");
                  if (e) {
                    var t = this.scanner.saveState();
                    this.scanner.scanComments();
                    var n = this.scanner.lex();
                    this.scanner.restoreState(t),
                      (e =
                        t.lineNumber === n.lineNumber &&
                        4 === n.type &&
                        "function" === n.value);
                  }
                  return e;
                }),
                (e.prototype.parseFunctionDeclaration = function (e) {
                  var t = this.createNode(),
                    n = this.matchContextualKeyword("async");
                  n && this.nextToken(), this.expectKeyword("function");
                  var r,
                    i = !n && this.match("*");
                  i && this.nextToken();
                  var a = null,
                    u = null;
                  if (!e || !this.match("(")) {
                    var c = this.lookahead;
                    (a = this.parseVariableIdentifier()),
                      this.context.strict
                        ? this.scanner.isRestrictedWord(c.value) &&
                          this.tolerateUnexpectedToken(
                            c,
                            s.Messages.StrictFunctionName
                          )
                        : this.scanner.isRestrictedWord(c.value)
                        ? ((u = c), (r = s.Messages.StrictFunctionName))
                        : this.scanner.isStrictModeReservedWord(c.value) &&
                          ((u = c), (r = s.Messages.StrictReservedWord));
                  }
                  var l = this.context.await,
                    h = this.context.allowYield;
                  (this.context.await = n), (this.context.allowYield = !i);
                  var d = this.parseFormalParameters(u),
                    p = d.params,
                    f = d.stricted;
                  (u = d.firstRestricted), d.message && (r = d.message);
                  var m = this.context.strict,
                    g = this.context.allowStrictDirective;
                  this.context.allowStrictDirective = d.simple;
                  var y = this.parseFunctionSourceElements();
                  return (
                    this.context.strict && u && this.throwUnexpectedToken(u, r),
                    this.context.strict &&
                      f &&
                      this.tolerateUnexpectedToken(f, r),
                    (this.context.strict = m),
                    (this.context.allowStrictDirective = g),
                    (this.context.await = l),
                    (this.context.allowYield = h),
                    n
                      ? this.finalize(
                          t,
                          new o.AsyncFunctionDeclaration(a, p, y)
                        )
                      : this.finalize(t, new o.FunctionDeclaration(a, p, y, i))
                  );
                }),
                (e.prototype.parseFunctionExpression = function () {
                  var e = this.createNode(),
                    t = this.matchContextualKeyword("async");
                  t && this.nextToken(), this.expectKeyword("function");
                  var n,
                    r = !t && this.match("*");
                  r && this.nextToken();
                  var i,
                    a = null,
                    u = this.context.await,
                    c = this.context.allowYield;
                  if (
                    ((this.context.await = t),
                    (this.context.allowYield = !r),
                    !this.match("("))
                  ) {
                    var l = this.lookahead;
                    (a =
                      this.context.strict || r || !this.matchKeyword("yield")
                        ? this.parseVariableIdentifier()
                        : this.parseIdentifierName()),
                      this.context.strict
                        ? this.scanner.isRestrictedWord(l.value) &&
                          this.tolerateUnexpectedToken(
                            l,
                            s.Messages.StrictFunctionName
                          )
                        : this.scanner.isRestrictedWord(l.value)
                        ? ((i = l), (n = s.Messages.StrictFunctionName))
                        : this.scanner.isStrictModeReservedWord(l.value) &&
                          ((i = l), (n = s.Messages.StrictReservedWord));
                  }
                  var h = this.parseFormalParameters(i),
                    d = h.params,
                    p = h.stricted;
                  (i = h.firstRestricted), h.message && (n = h.message);
                  var f = this.context.strict,
                    m = this.context.allowStrictDirective;
                  this.context.allowStrictDirective = h.simple;
                  var g = this.parseFunctionSourceElements();
                  return (
                    this.context.strict && i && this.throwUnexpectedToken(i, n),
                    this.context.strict &&
                      p &&
                      this.tolerateUnexpectedToken(p, n),
                    (this.context.strict = f),
                    (this.context.allowStrictDirective = m),
                    (this.context.await = u),
                    (this.context.allowYield = c),
                    t
                      ? this.finalize(e, new o.AsyncFunctionExpression(a, d, g))
                      : this.finalize(e, new o.FunctionExpression(a, d, g, r))
                  );
                }),
                (e.prototype.parseDirective = function () {
                  var e = this.lookahead,
                    t = this.createNode(),
                    n = this.parseExpression(),
                    r =
                      n.type === u.Syntax.Literal
                        ? this.getTokenRaw(e).slice(1, -1)
                        : null;
                  return (
                    this.consumeSemicolon(),
                    this.finalize(
                      t,
                      r ? new o.Directive(n, r) : new o.ExpressionStatement(n)
                    )
                  );
                }),
                (e.prototype.parseDirectivePrologues = function () {
                  for (var e = null, t = []; ; ) {
                    var n = this.lookahead;
                    if (8 !== n.type) break;
                    var r = this.parseDirective();
                    t.push(r);
                    var i = r.directive;
                    if ("string" != typeof i) break;
                    "use strict" === i
                      ? ((this.context.strict = !0),
                        e &&
                          this.tolerateUnexpectedToken(
                            e,
                            s.Messages.StrictOctalLiteral
                          ),
                        this.context.allowStrictDirective ||
                          this.tolerateUnexpectedToken(
                            n,
                            s.Messages.IllegalLanguageModeDirective
                          ))
                      : !e && n.octal && (e = n);
                  }
                  return t;
                }),
                (e.prototype.qualifiedPropertyName = function (e) {
                  switch (e.type) {
                    case 3:
                    case 8:
                    case 1:
                    case 5:
                    case 6:
                    case 4:
                      return !0;
                    case 7:
                      return "[" === e.value;
                  }
                  return !1;
                }),
                (e.prototype.parseGetterMethod = function () {
                  var e = this.createNode(),
                    t = this.context.allowYield;
                  this.context.allowYield = !0;
                  var n = this.parseFormalParameters();
                  n.params.length > 0 &&
                    this.tolerateError(s.Messages.BadGetterArity);
                  var r = this.parsePropertyMethod(n);
                  return (
                    (this.context.allowYield = t),
                    this.finalize(
                      e,
                      new o.FunctionExpression(null, n.params, r, !1)
                    )
                  );
                }),
                (e.prototype.parseSetterMethod = function () {
                  var e = this.createNode(),
                    t = this.context.allowYield;
                  this.context.allowYield = !0;
                  var n = this.parseFormalParameters();
                  1 !== n.params.length
                    ? this.tolerateError(s.Messages.BadSetterArity)
                    : n.params[0] instanceof o.RestElement &&
                      this.tolerateError(s.Messages.BadSetterRestParameter);
                  var r = this.parsePropertyMethod(n);
                  return (
                    (this.context.allowYield = t),
                    this.finalize(
                      e,
                      new o.FunctionExpression(null, n.params, r, !1)
                    )
                  );
                }),
                (e.prototype.parseGeneratorMethod = function () {
                  var e = this.createNode(),
                    t = this.context.allowYield;
                  this.context.allowYield = !0;
                  var n = this.parseFormalParameters();
                  this.context.allowYield = !1;
                  var r = this.parsePropertyMethod(n);
                  return (
                    (this.context.allowYield = t),
                    this.finalize(
                      e,
                      new o.FunctionExpression(null, n.params, r, !0)
                    )
                  );
                }),
                (e.prototype.isStartOfExpression = function () {
                  var e = !0,
                    t = this.lookahead.value;
                  switch (this.lookahead.type) {
                    case 7:
                      e =
                        "[" === t ||
                        "(" === t ||
                        "{" === t ||
                        "+" === t ||
                        "-" === t ||
                        "!" === t ||
                        "~" === t ||
                        "++" === t ||
                        "--" === t ||
                        "/" === t ||
                        "/=" === t;
                      break;
                    case 4:
                      e =
                        "class" === t ||
                        "delete" === t ||
                        "function" === t ||
                        "let" === t ||
                        "new" === t ||
                        "super" === t ||
                        "this" === t ||
                        "typeof" === t ||
                        "void" === t ||
                        "yield" === t;
                  }
                  return e;
                }),
                (e.prototype.parseYieldExpression = function () {
                  var e = this.createNode();
                  this.expectKeyword("yield");
                  var t = null,
                    n = !1;
                  if (!this.hasLineTerminator) {
                    var r = this.context.allowYield;
                    (this.context.allowYield = !1),
                      (n = this.match("*"))
                        ? (this.nextToken(),
                          (t = this.parseAssignmentExpression()))
                        : this.isStartOfExpression() &&
                          (t = this.parseAssignmentExpression()),
                      (this.context.allowYield = r);
                  }
                  return this.finalize(e, new o.YieldExpression(t, n));
                }),
                (e.prototype.parseClassElement = function (e) {
                  var t = this.lookahead,
                    n = this.createNode(),
                    r = "",
                    i = null,
                    a = null,
                    u = !1,
                    c = !1,
                    l = !1,
                    h = !1;
                  if (this.match("*")) this.nextToken();
                  else if (
                    ((u = this.match("[")),
                    "static" === (i = this.parseObjectPropertyKey()).name &&
                      (this.qualifiedPropertyName(this.lookahead) ||
                        this.match("*")) &&
                      ((t = this.lookahead),
                      (l = !0),
                      (u = this.match("[")),
                      this.match("*")
                        ? this.nextToken()
                        : (i = this.parseObjectPropertyKey())),
                    3 === t.type &&
                      !this.hasLineTerminator &&
                      "async" === t.value)
                  ) {
                    var d = this.lookahead.value;
                    ":" !== d &&
                      "(" !== d &&
                      "*" !== d &&
                      ((h = !0),
                      (t = this.lookahead),
                      (i = this.parseObjectPropertyKey()),
                      3 === t.type &&
                        "constructor" === t.value &&
                        this.tolerateUnexpectedToken(
                          t,
                          s.Messages.ConstructorIsAsync
                        ));
                  }
                  var p = this.qualifiedPropertyName(this.lookahead);
                  return (
                    3 === t.type
                      ? "get" === t.value && p
                        ? ((r = "get"),
                          (u = this.match("[")),
                          (i = this.parseObjectPropertyKey()),
                          (this.context.allowYield = !1),
                          (a = this.parseGetterMethod()))
                        : "set" === t.value &&
                          p &&
                          ((r = "set"),
                          (u = this.match("[")),
                          (i = this.parseObjectPropertyKey()),
                          (a = this.parseSetterMethod()))
                      : 7 === t.type &&
                        "*" === t.value &&
                        p &&
                        ((r = "init"),
                        (u = this.match("[")),
                        (i = this.parseObjectPropertyKey()),
                        (a = this.parseGeneratorMethod()),
                        (c = !0)),
                    !r &&
                      i &&
                      this.match("(") &&
                      ((r = "init"),
                      (a = h
                        ? this.parsePropertyMethodAsyncFunction()
                        : this.parsePropertyMethodFunction()),
                      (c = !0)),
                    r || this.throwUnexpectedToken(this.lookahead),
                    "init" === r && (r = "method"),
                    u ||
                      (l &&
                        this.isPropertyKey(i, "prototype") &&
                        this.throwUnexpectedToken(
                          t,
                          s.Messages.StaticPrototype
                        ),
                      !l &&
                        this.isPropertyKey(i, "constructor") &&
                        (("method" !== r || !c || (a && a.generator)) &&
                          this.throwUnexpectedToken(
                            t,
                            s.Messages.ConstructorSpecialMethod
                          ),
                        e.value
                          ? this.throwUnexpectedToken(
                              t,
                              s.Messages.DuplicateConstructor
                            )
                          : (e.value = !0),
                        (r = "constructor"))),
                    this.finalize(n, new o.MethodDefinition(i, u, a, r, l))
                  );
                }),
                (e.prototype.parseClassElementList = function () {
                  var e = [],
                    t = { value: !1 };
                  for (this.expect("{"); !this.match("}"); )
                    this.match(";")
                      ? this.nextToken()
                      : e.push(this.parseClassElement(t));
                  return this.expect("}"), e;
                }),
                (e.prototype.parseClassBody = function () {
                  var e = this.createNode(),
                    t = this.parseClassElementList();
                  return this.finalize(e, new o.ClassBody(t));
                }),
                (e.prototype.parseClassDeclaration = function (e) {
                  var t = this.createNode(),
                    n = this.context.strict;
                  (this.context.strict = !0), this.expectKeyword("class");
                  var r =
                      e && 3 !== this.lookahead.type
                        ? null
                        : this.parseVariableIdentifier(),
                    i = null;
                  this.matchKeyword("extends") &&
                    (this.nextToken(),
                    (i = this.isolateCoverGrammar(
                      this.parseLeftHandSideExpressionAllowCall
                    )));
                  var s = this.parseClassBody();
                  return (
                    (this.context.strict = n),
                    this.finalize(t, new o.ClassDeclaration(r, i, s))
                  );
                }),
                (e.prototype.parseClassExpression = function () {
                  var e = this.createNode(),
                    t = this.context.strict;
                  (this.context.strict = !0), this.expectKeyword("class");
                  var n =
                      3 === this.lookahead.type
                        ? this.parseVariableIdentifier()
                        : null,
                    r = null;
                  this.matchKeyword("extends") &&
                    (this.nextToken(),
                    (r = this.isolateCoverGrammar(
                      this.parseLeftHandSideExpressionAllowCall
                    )));
                  var i = this.parseClassBody();
                  return (
                    (this.context.strict = t),
                    this.finalize(e, new o.ClassExpression(n, r, i))
                  );
                }),
                (e.prototype.parseModule = function () {
                  (this.context.strict = !0),
                    (this.context.isModule = !0),
                    (this.scanner.isModule = !0);
                  for (
                    var e = this.createNode(),
                      t = this.parseDirectivePrologues();
                    2 !== this.lookahead.type;

                  )
                    t.push(this.parseStatementListItem());
                  return this.finalize(e, new o.Module(t));
                }),
                (e.prototype.parseScript = function () {
                  for (
                    var e = this.createNode(),
                      t = this.parseDirectivePrologues();
                    2 !== this.lookahead.type;

                  )
                    t.push(this.parseStatementListItem());
                  return this.finalize(e, new o.Script(t));
                }),
                (e.prototype.parseModuleSpecifier = function () {
                  var e = this.createNode();
                  8 !== this.lookahead.type &&
                    this.throwError(s.Messages.InvalidModuleSpecifier);
                  var t = this.nextToken(),
                    n = this.getTokenRaw(t);
                  return this.finalize(e, new o.Literal(t.value, n));
                }),
                (e.prototype.parseImportSpecifier = function () {
                  var e,
                    t,
                    n = this.createNode();
                  return (
                    3 === this.lookahead.type
                      ? ((t = e = this.parseVariableIdentifier()),
                        this.matchContextualKeyword("as") &&
                          (this.nextToken(),
                          (t = this.parseVariableIdentifier())))
                      : ((t = e = this.parseIdentifierName()),
                        this.matchContextualKeyword("as")
                          ? (this.nextToken(),
                            (t = this.parseVariableIdentifier()))
                          : this.throwUnexpectedToken(this.nextToken())),
                    this.finalize(n, new o.ImportSpecifier(t, e))
                  );
                }),
                (e.prototype.parseNamedImports = function () {
                  this.expect("{");
                  for (var e = []; !this.match("}"); )
                    e.push(this.parseImportSpecifier()),
                      this.match("}") || this.expect(",");
                  return this.expect("}"), e;
                }),
                (e.prototype.parseImportDefaultSpecifier = function () {
                  var e = this.createNode(),
                    t = this.parseIdentifierName();
                  return this.finalize(e, new o.ImportDefaultSpecifier(t));
                }),
                (e.prototype.parseImportNamespaceSpecifier = function () {
                  var e = this.createNode();
                  this.expect("*"),
                    this.matchContextualKeyword("as") ||
                      this.throwError(s.Messages.NoAsAfterImportNamespace),
                    this.nextToken();
                  var t = this.parseIdentifierName();
                  return this.finalize(e, new o.ImportNamespaceSpecifier(t));
                }),
                (e.prototype.parseImportDeclaration = function () {
                  this.context.inFunctionBody &&
                    this.throwError(s.Messages.IllegalImportDeclaration);
                  var e,
                    t = this.createNode();
                  this.expectKeyword("import");
                  var n = [];
                  if (8 === this.lookahead.type)
                    e = this.parseModuleSpecifier();
                  else {
                    if (
                      (this.match("{")
                        ? (n = n.concat(this.parseNamedImports()))
                        : this.match("*")
                        ? n.push(this.parseImportNamespaceSpecifier())
                        : this.isIdentifierName(this.lookahead) &&
                          !this.matchKeyword("default")
                        ? (n.push(this.parseImportDefaultSpecifier()),
                          this.match(",") &&
                            (this.nextToken(),
                            this.match("*")
                              ? n.push(this.parseImportNamespaceSpecifier())
                              : this.match("{")
                              ? (n = n.concat(this.parseNamedImports()))
                              : this.throwUnexpectedToken(this.lookahead)))
                        : this.throwUnexpectedToken(this.nextToken()),
                      !this.matchContextualKeyword("from"))
                    ) {
                      var r = this.lookahead.value
                        ? s.Messages.UnexpectedToken
                        : s.Messages.MissingFromClause;
                      this.throwError(r, this.lookahead.value);
                    }
                    this.nextToken(), (e = this.parseModuleSpecifier());
                  }
                  return (
                    this.consumeSemicolon(),
                    this.finalize(t, new o.ImportDeclaration(n, e))
                  );
                }),
                (e.prototype.parseExportSpecifier = function () {
                  var e = this.createNode(),
                    t = this.parseIdentifierName(),
                    n = t;
                  return (
                    this.matchContextualKeyword("as") &&
                      (this.nextToken(), (n = this.parseIdentifierName())),
                    this.finalize(e, new o.ExportSpecifier(t, n))
                  );
                }),
                (e.prototype.parseExportDeclaration = function () {
                  this.context.inFunctionBody &&
                    this.throwError(s.Messages.IllegalExportDeclaration);
                  var e,
                    t = this.createNode();
                  if (
                    (this.expectKeyword("export"), this.matchKeyword("default"))
                  )
                    if ((this.nextToken(), this.matchKeyword("function"))) {
                      var n = this.parseFunctionDeclaration(!0);
                      e = this.finalize(t, new o.ExportDefaultDeclaration(n));
                    } else
                      this.matchKeyword("class")
                        ? ((n = this.parseClassDeclaration(!0)),
                          (e = this.finalize(
                            t,
                            new o.ExportDefaultDeclaration(n)
                          )))
                        : this.matchContextualKeyword("async")
                        ? ((n = this.matchAsyncFunction()
                            ? this.parseFunctionDeclaration(!0)
                            : this.parseAssignmentExpression()),
                          (e = this.finalize(
                            t,
                            new o.ExportDefaultDeclaration(n)
                          )))
                        : (this.matchContextualKeyword("from") &&
                            this.throwError(
                              s.Messages.UnexpectedToken,
                              this.lookahead.value
                            ),
                          (n = this.match("{")
                            ? this.parseObjectInitializer()
                            : this.match("[")
                            ? this.parseArrayInitializer()
                            : this.parseAssignmentExpression()),
                          this.consumeSemicolon(),
                          (e = this.finalize(
                            t,
                            new o.ExportDefaultDeclaration(n)
                          )));
                  else if (this.match("*")) {
                    if (
                      (this.nextToken(), !this.matchContextualKeyword("from"))
                    ) {
                      var r = this.lookahead.value
                        ? s.Messages.UnexpectedToken
                        : s.Messages.MissingFromClause;
                      this.throwError(r, this.lookahead.value);
                    }
                    this.nextToken();
                    var i = this.parseModuleSpecifier();
                    this.consumeSemicolon(),
                      (e = this.finalize(t, new o.ExportAllDeclaration(i)));
                  } else if (4 === this.lookahead.type) {
                    switch (((n = void 0), this.lookahead.value)) {
                      case "let":
                      case "const":
                        n = this.parseLexicalDeclaration({ inFor: !1 });
                        break;
                      case "var":
                      case "class":
                      case "function":
                        n = this.parseStatementListItem();
                        break;
                      default:
                        this.throwUnexpectedToken(this.lookahead);
                    }
                    e = this.finalize(
                      t,
                      new o.ExportNamedDeclaration(n, [], null)
                    );
                  } else if (this.matchAsyncFunction())
                    (n = this.parseFunctionDeclaration()),
                      (e = this.finalize(
                        t,
                        new o.ExportNamedDeclaration(n, [], null)
                      ));
                  else {
                    var a = [],
                      u = null,
                      c = !1;
                    for (this.expect("{"); !this.match("}"); )
                      (c = c || this.matchKeyword("default")),
                        a.push(this.parseExportSpecifier()),
                        this.match("}") || this.expect(",");
                    this.expect("}"),
                      this.matchContextualKeyword("from")
                        ? (this.nextToken(),
                          (u = this.parseModuleSpecifier()),
                          this.consumeSemicolon())
                        : c
                        ? ((r = this.lookahead.value
                            ? s.Messages.UnexpectedToken
                            : s.Messages.MissingFromClause),
                          this.throwError(r, this.lookahead.value))
                        : this.consumeSemicolon(),
                      (e = this.finalize(
                        t,
                        new o.ExportNamedDeclaration(null, a, u)
                      ));
                  }
                  return e;
                }),
                e
              );
            })();
          t.Parser = l;
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 }),
            (t.assert = function (e, t) {
              if (!e) throw new Error("ASSERT: " + t);
            });
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var n = (function () {
            function e() {
              (this.errors = []), (this.tolerant = !1);
            }
            return (
              (e.prototype.recordError = function (e) {
                this.errors.push(e);
              }),
              (e.prototype.tolerate = function (e) {
                if (!this.tolerant) throw e;
                this.recordError(e);
              }),
              (e.prototype.constructError = function (e, t) {
                var n = new Error(e);
                try {
                  throw n;
                } catch (e) {
                  Object.create &&
                    Object.defineProperty &&
                    ((n = Object.create(e)),
                    Object.defineProperty(n, "column", { value: t }));
                }
                return n;
              }),
              (e.prototype.createError = function (e, t, n, r) {
                var i = "Line " + t + ": " + r,
                  s = this.constructError(i, n);
                return (
                  (s.index = e), (s.lineNumber = t), (s.description = r), s
                );
              }),
              (e.prototype.throwError = function (e, t, n, r) {
                throw this.createError(e, t, n, r);
              }),
              (e.prototype.tolerateError = function (e, t, n, r) {
                var i = this.createError(e, t, n, r);
                if (!this.tolerant) throw i;
                this.recordError(i);
              }),
              e
            );
          })();
          t.ErrorHandler = n;
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 }),
            (t.Messages = {
              BadGetterArity: "Getter must not have any formal parameters",
              BadSetterArity: "Setter must have exactly one formal parameter",
              BadSetterRestParameter:
                "Setter function argument must not be a rest parameter",
              ConstructorIsAsync:
                "Class constructor may not be an async method",
              ConstructorSpecialMethod:
                "Class constructor may not be an accessor",
              DeclarationMissingInitializer:
                "Missing initializer in %0 declaration",
              DefaultRestParameter: "Unexpected token =",
              DuplicateBinding: "Duplicate binding %0",
              DuplicateConstructor: "A class may only have one constructor",
              DuplicateProtoProperty:
                "Duplicate __proto__ fields are not allowed in object literals",
              ForInOfLoopInitializer:
                "%0 loop variable declaration may not have an initializer",
              GeneratorInLegacyContext:
                "Generator declarations are not allowed in legacy contexts",
              IllegalBreak: "Illegal break statement",
              IllegalContinue: "Illegal continue statement",
              IllegalExportDeclaration: "Unexpected token",
              IllegalImportDeclaration: "Unexpected token",
              IllegalLanguageModeDirective:
                "Illegal 'use strict' directive in function with non-simple parameter list",
              IllegalReturn: "Illegal return statement",
              InvalidEscapedReservedWord:
                "Keyword must not contain escaped characters",
              InvalidHexEscapeSequence: "Invalid hexadecimal escape sequence",
              InvalidLHSInAssignment: "Invalid left-hand side in assignment",
              InvalidLHSInForIn: "Invalid left-hand side in for-in",
              InvalidLHSInForLoop: "Invalid left-hand side in for-loop",
              InvalidModuleSpecifier: "Unexpected token",
              InvalidRegExp: "Invalid regular expression",
              LetInLexicalBinding:
                "let is disallowed as a lexically bound name",
              MissingFromClause: "Unexpected token",
              MultipleDefaultsInSwitch:
                "More than one default clause in switch statement",
              NewlineAfterThrow: "Illegal newline after throw",
              NoAsAfterImportNamespace: "Unexpected token",
              NoCatchOrFinally: "Missing catch or finally after try",
              ParameterAfterRestParameter:
                "Rest parameter must be last formal parameter",
              Redeclaration: "%0 '%1' has already been declared",
              StaticPrototype:
                "Classes may not have static property named prototype",
              StrictCatchVariable:
                "Catch variable may not be eval or arguments in strict mode",
              StrictDelete:
                "Delete of an unqualified identifier in strict mode.",
              StrictFunction:
                "In strict mode code, functions can only be declared at top level or inside a block",
              StrictFunctionName:
                "Function name may not be eval or arguments in strict mode",
              StrictLHSAssignment:
                "Assignment to eval or arguments is not allowed in strict mode",
              StrictLHSPostfix:
                "Postfix increment/decrement may not have eval or arguments operand in strict mode",
              StrictLHSPrefix:
                "Prefix increment/decrement may not have eval or arguments operand in strict mode",
              StrictModeWith:
                "Strict mode code may not include a with statement",
              StrictOctalLiteral:
                "Octal literals are not allowed in strict mode.",
              StrictParamDupe:
                "Strict mode function may not have duplicate parameter names",
              StrictParamName:
                "Parameter name eval or arguments is not allowed in strict mode",
              StrictReservedWord: "Use of future reserved word in strict mode",
              StrictVarName:
                "Variable name may not be eval or arguments in strict mode",
              TemplateOctalLiteral:
                "Octal literals are not allowed in template strings.",
              UnexpectedEOS: "Unexpected end of input",
              UnexpectedIdentifier: "Unexpected identifier",
              UnexpectedNumber: "Unexpected number",
              UnexpectedReserved: "Unexpected reserved word",
              UnexpectedString: "Unexpected string",
              UnexpectedTemplate: "Unexpected quasi %0",
              UnexpectedToken: "Unexpected token %0",
              UnexpectedTokenIllegal: "Unexpected token ILLEGAL",
              UnknownLabel: "Undefined label '%0'",
              UnterminatedRegExp: "Invalid regular expression: missing /",
            });
        },
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(9),
            i = n(4),
            s = n(11);
          function o(e) {
            return "0123456789abcdef".indexOf(e.toLowerCase());
          }
          function a(e) {
            return "01234567".indexOf(e);
          }
          var u = (function () {
            function e(e, t) {
              (this.source = e),
                (this.errorHandler = t),
                (this.trackComment = !1),
                (this.isModule = !1),
                (this.length = e.length),
                (this.index = 0),
                (this.lineNumber = e.length > 0 ? 1 : 0),
                (this.lineStart = 0),
                (this.curlyStack = []);
            }
            return (
              (e.prototype.saveState = function () {
                return {
                  index: this.index,
                  lineNumber: this.lineNumber,
                  lineStart: this.lineStart,
                };
              }),
              (e.prototype.restoreState = function (e) {
                (this.index = e.index),
                  (this.lineNumber = e.lineNumber),
                  (this.lineStart = e.lineStart);
              }),
              (e.prototype.eof = function () {
                return this.index >= this.length;
              }),
              (e.prototype.throwUnexpectedToken = function (e) {
                return (
                  void 0 === e && (e = s.Messages.UnexpectedTokenIllegal),
                  this.errorHandler.throwError(
                    this.index,
                    this.lineNumber,
                    this.index - this.lineStart + 1,
                    e
                  )
                );
              }),
              (e.prototype.tolerateUnexpectedToken = function (e) {
                void 0 === e && (e = s.Messages.UnexpectedTokenIllegal),
                  this.errorHandler.tolerateError(
                    this.index,
                    this.lineNumber,
                    this.index - this.lineStart + 1,
                    e
                  );
              }),
              (e.prototype.skipSingleLineComment = function (e) {
                var t,
                  n,
                  r = [];
                for (
                  this.trackComment &&
                  ((r = []),
                  (t = this.index - e),
                  (n = {
                    start: {
                      line: this.lineNumber,
                      column: this.index - this.lineStart - e,
                    },
                    end: {},
                  }));
                  !this.eof();

                ) {
                  var s = this.source.charCodeAt(this.index);
                  if ((++this.index, i.Character.isLineTerminator(s))) {
                    if (this.trackComment) {
                      n.end = {
                        line: this.lineNumber,
                        column: this.index - this.lineStart - 1,
                      };
                      var o = {
                        multiLine: !1,
                        slice: [t + e, this.index - 1],
                        range: [t, this.index - 1],
                        loc: n,
                      };
                      r.push(o);
                    }
                    return (
                      13 === s &&
                        10 === this.source.charCodeAt(this.index) &&
                        ++this.index,
                      ++this.lineNumber,
                      (this.lineStart = this.index),
                      r
                    );
                  }
                }
                return (
                  this.trackComment &&
                    ((n.end = {
                      line: this.lineNumber,
                      column: this.index - this.lineStart,
                    }),
                    (o = {
                      multiLine: !1,
                      slice: [t + e, this.index],
                      range: [t, this.index],
                      loc: n,
                    }),
                    r.push(o)),
                  r
                );
              }),
              (e.prototype.skipMultiLineComment = function () {
                var e,
                  t,
                  n = [];
                for (
                  this.trackComment &&
                  ((n = []),
                  (e = this.index - 2),
                  (t = {
                    start: {
                      line: this.lineNumber,
                      column: this.index - this.lineStart - 2,
                    },
                    end: {},
                  }));
                  !this.eof();

                ) {
                  var r = this.source.charCodeAt(this.index);
                  if (i.Character.isLineTerminator(r))
                    13 === r &&
                      10 === this.source.charCodeAt(this.index + 1) &&
                      ++this.index,
                      ++this.lineNumber,
                      ++this.index,
                      (this.lineStart = this.index);
                  else if (42 === r) {
                    if (47 === this.source.charCodeAt(this.index + 1)) {
                      if (((this.index += 2), this.trackComment)) {
                        t.end = {
                          line: this.lineNumber,
                          column: this.index - this.lineStart,
                        };
                        var s = {
                          multiLine: !0,
                          slice: [e + 2, this.index - 2],
                          range: [e, this.index],
                          loc: t,
                        };
                        n.push(s);
                      }
                      return n;
                    }
                    ++this.index;
                  } else ++this.index;
                }
                return (
                  this.trackComment &&
                    ((t.end = {
                      line: this.lineNumber,
                      column: this.index - this.lineStart,
                    }),
                    (s = {
                      multiLine: !0,
                      slice: [e + 2, this.index],
                      range: [e, this.index],
                      loc: t,
                    }),
                    n.push(s)),
                  this.tolerateUnexpectedToken(),
                  n
                );
              }),
              (e.prototype.scanComments = function () {
                var e;
                this.trackComment && (e = []);
                for (var t = 0 === this.index; !this.eof(); ) {
                  var n = this.source.charCodeAt(this.index);
                  if (i.Character.isWhiteSpace(n)) ++this.index;
                  else if (i.Character.isLineTerminator(n))
                    ++this.index,
                      13 === n &&
                        10 === this.source.charCodeAt(this.index) &&
                        ++this.index,
                      ++this.lineNumber,
                      (this.lineStart = this.index),
                      (t = !0);
                  else if (47 === n)
                    if (47 === (n = this.source.charCodeAt(this.index + 1))) {
                      this.index += 2;
                      var r = this.skipSingleLineComment(2);
                      this.trackComment && (e = e.concat(r)), (t = !0);
                    } else {
                      if (42 !== n) break;
                      (this.index += 2),
                        (r = this.skipMultiLineComment()),
                        this.trackComment && (e = e.concat(r));
                    }
                  else if (t && 45 === n) {
                    if (
                      45 !== this.source.charCodeAt(this.index + 1) ||
                      62 !== this.source.charCodeAt(this.index + 2)
                    )
                      break;
                    (this.index += 3),
                      (r = this.skipSingleLineComment(3)),
                      this.trackComment && (e = e.concat(r));
                  } else {
                    if (60 !== n || this.isModule) break;
                    if (
                      "!--" !==
                      this.source.slice(this.index + 1, this.index + 4)
                    )
                      break;
                    (this.index += 4),
                      (r = this.skipSingleLineComment(4)),
                      this.trackComment && (e = e.concat(r));
                  }
                }
                return e;
              }),
              (e.prototype.isFutureReservedWord = function (e) {
                switch (e) {
                  case "enum":
                  case "export":
                  case "import":
                  case "super":
                    return !0;
                  default:
                    return !1;
                }
              }),
              (e.prototype.isStrictModeReservedWord = function (e) {
                switch (e) {
                  case "implements":
                  case "interface":
                  case "package":
                  case "private":
                  case "protected":
                  case "public":
                  case "static":
                  case "yield":
                  case "let":
                    return !0;
                  default:
                    return !1;
                }
              }),
              (e.prototype.isRestrictedWord = function (e) {
                return "eval" === e || "arguments" === e;
              }),
              (e.prototype.isKeyword = function (e) {
                switch (e.length) {
                  case 2:
                    return "if" === e || "in" === e || "do" === e;
                  case 3:
                    return (
                      "var" === e ||
                      "for" === e ||
                      "new" === e ||
                      "try" === e ||
                      "let" === e
                    );
                  case 4:
                    return (
                      "this" === e ||
                      "else" === e ||
                      "case" === e ||
                      "void" === e ||
                      "with" === e ||
                      "enum" === e
                    );
                  case 5:
                    return (
                      "while" === e ||
                      "break" === e ||
                      "catch" === e ||
                      "throw" === e ||
                      "const" === e ||
                      "yield" === e ||
                      "class" === e ||
                      "super" === e
                    );
                  case 6:
                    return (
                      "return" === e ||
                      "typeof" === e ||
                      "delete" === e ||
                      "switch" === e ||
                      "export" === e ||
                      "import" === e
                    );
                  case 7:
                    return (
                      "default" === e || "finally" === e || "extends" === e
                    );
                  case 8:
                    return (
                      "function" === e || "continue" === e || "debugger" === e
                    );
                  case 10:
                    return "instanceof" === e;
                  default:
                    return !1;
                }
              }),
              (e.prototype.codePointAt = function (e) {
                var t = this.source.charCodeAt(e);
                if (t >= 55296 && t <= 56319) {
                  var n = this.source.charCodeAt(e + 1);
                  n >= 56320 &&
                    n <= 57343 &&
                    (t = 1024 * (t - 55296) + n - 56320 + 65536);
                }
                return t;
              }),
              (e.prototype.scanHexEscape = function (e) {
                for (var t = "u" === e ? 4 : 2, n = 0, r = 0; r < t; ++r) {
                  if (
                    this.eof() ||
                    !i.Character.isHexDigit(this.source.charCodeAt(this.index))
                  )
                    return null;
                  n = 16 * n + o(this.source[this.index++]);
                }
                return String.fromCharCode(n);
              }),
              (e.prototype.scanUnicodeCodePointEscape = function () {
                var e = this.source[this.index],
                  t = 0;
                for (
                  "}" === e && this.throwUnexpectedToken();
                  !this.eof() &&
                  ((e = this.source[this.index++]),
                  i.Character.isHexDigit(e.charCodeAt(0)));

                )
                  t = 16 * t + o(e);
                return (
                  (t > 1114111 || "}" !== e) && this.throwUnexpectedToken(),
                  i.Character.fromCodePoint(t)
                );
              }),
              (e.prototype.getIdentifier = function () {
                for (var e = this.index++; !this.eof(); ) {
                  var t = this.source.charCodeAt(this.index);
                  if (92 === t)
                    return (this.index = e), this.getComplexIdentifier();
                  if (t >= 55296 && t < 57343)
                    return (this.index = e), this.getComplexIdentifier();
                  if (!i.Character.isIdentifierPart(t)) break;
                  ++this.index;
                }
                return this.source.slice(e, this.index);
              }),
              (e.prototype.getComplexIdentifier = function () {
                var e,
                  t = this.codePointAt(this.index),
                  n = i.Character.fromCodePoint(t);
                for (
                  this.index += n.length,
                    92 === t &&
                      (117 !== this.source.charCodeAt(this.index) &&
                        this.throwUnexpectedToken(),
                      ++this.index,
                      "{" === this.source[this.index]
                        ? (++this.index,
                          (e = this.scanUnicodeCodePointEscape()))
                        : (null !== (e = this.scanHexEscape("u")) &&
                            "\\" !== e &&
                            i.Character.isIdentifierStart(e.charCodeAt(0))) ||
                          this.throwUnexpectedToken(),
                      (n = e));
                  !this.eof() &&
                  ((t = this.codePointAt(this.index)),
                  i.Character.isIdentifierPart(t));

                )
                  (n += e = i.Character.fromCodePoint(t)),
                    (this.index += e.length),
                    92 === t &&
                      ((n = n.substr(0, n.length - 1)),
                      117 !== this.source.charCodeAt(this.index) &&
                        this.throwUnexpectedToken(),
                      ++this.index,
                      "{" === this.source[this.index]
                        ? (++this.index,
                          (e = this.scanUnicodeCodePointEscape()))
                        : (null !== (e = this.scanHexEscape("u")) &&
                            "\\" !== e &&
                            i.Character.isIdentifierPart(e.charCodeAt(0))) ||
                          this.throwUnexpectedToken(),
                      (n += e));
                return n;
              }),
              (e.prototype.octalToDecimal = function (e) {
                var t = "0" !== e,
                  n = a(e);
                return (
                  !this.eof() &&
                    i.Character.isOctalDigit(
                      this.source.charCodeAt(this.index)
                    ) &&
                    ((t = !0),
                    (n = 8 * n + a(this.source[this.index++])),
                    "0123".indexOf(e) >= 0 &&
                      !this.eof() &&
                      i.Character.isOctalDigit(
                        this.source.charCodeAt(this.index)
                      ) &&
                      (n = 8 * n + a(this.source[this.index++]))),
                  { code: n, octal: t }
                );
              }),
              (e.prototype.scanIdentifier = function () {
                var e,
                  t = this.index,
                  n =
                    92 === this.source.charCodeAt(t)
                      ? this.getComplexIdentifier()
                      : this.getIdentifier();
                if (
                  3 !=
                    (e =
                      1 === n.length
                        ? 3
                        : this.isKeyword(n)
                        ? 4
                        : "null" === n
                        ? 5
                        : "true" === n || "false" === n
                        ? 1
                        : 3) &&
                  t + n.length !== this.index
                ) {
                  var r = this.index;
                  (this.index = t),
                    this.tolerateUnexpectedToken(
                      s.Messages.InvalidEscapedReservedWord
                    ),
                    (this.index = r);
                }
                return {
                  type: e,
                  value: n,
                  lineNumber: this.lineNumber,
                  lineStart: this.lineStart,
                  start: t,
                  end: this.index,
                };
              }),
              (e.prototype.scanPunctuator = function () {
                var e = this.index,
                  t = this.source[this.index];
                switch (t) {
                  case "(":
                  case "{":
                    "{" === t && this.curlyStack.push("{"), ++this.index;
                    break;
                  case ".":
                    ++this.index,
                      "." === this.source[this.index] &&
                        "." === this.source[this.index + 1] &&
                        ((this.index += 2), (t = "..."));
                    break;
                  case "}":
                    ++this.index, this.curlyStack.pop();
                    break;
                  case ")":
                  case ";":
                  case ",":
                  case "[":
                  case "]":
                  case ":":
                  case "?":
                  case "~":
                    ++this.index;
                    break;
                  default:
                    ">>>=" === (t = this.source.substr(this.index, 4))
                      ? (this.index += 4)
                      : "===" === (t = t.substr(0, 3)) ||
                        "!==" === t ||
                        ">>>" === t ||
                        "<<=" === t ||
                        ">>=" === t ||
                        "**=" === t
                      ? (this.index += 3)
                      : "&&" === (t = t.substr(0, 2)) ||
                        "||" === t ||
                        "==" === t ||
                        "!=" === t ||
                        "+=" === t ||
                        "-=" === t ||
                        "*=" === t ||
                        "/=" === t ||
                        "++" === t ||
                        "--" === t ||
                        "<<" === t ||
                        ">>" === t ||
                        "&=" === t ||
                        "|=" === t ||
                        "^=" === t ||
                        "%=" === t ||
                        "<=" === t ||
                        ">=" === t ||
                        "=>" === t ||
                        "**" === t
                      ? (this.index += 2)
                      : ((t = this.source[this.index]),
                        "<>=!+-*%&|^/".indexOf(t) >= 0 && ++this.index);
                }
                return (
                  this.index === e && this.throwUnexpectedToken(),
                  {
                    type: 7,
                    value: t,
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: e,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.scanHexLiteral = function (e) {
                for (
                  var t = "";
                  !this.eof() &&
                  i.Character.isHexDigit(this.source.charCodeAt(this.index));

                )
                  t += this.source[this.index++];
                return (
                  0 === t.length && this.throwUnexpectedToken(),
                  i.Character.isIdentifierStart(
                    this.source.charCodeAt(this.index)
                  ) && this.throwUnexpectedToken(),
                  {
                    type: 6,
                    value: parseInt("0x" + t, 16),
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: e,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.scanBinaryLiteral = function (e) {
                for (
                  var t, n = "";
                  !this.eof() &&
                  ("0" === (t = this.source[this.index]) || "1" === t);

                )
                  n += this.source[this.index++];
                return (
                  0 === n.length && this.throwUnexpectedToken(),
                  this.eof() ||
                    ((t = this.source.charCodeAt(this.index)),
                    (i.Character.isIdentifierStart(t) ||
                      i.Character.isDecimalDigit(t)) &&
                      this.throwUnexpectedToken()),
                  {
                    type: 6,
                    value: parseInt(n, 2),
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: e,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.scanOctalLiteral = function (e, t) {
                var n = "",
                  r = !1;
                for (
                  i.Character.isOctalDigit(e.charCodeAt(0))
                    ? ((r = !0), (n = "0" + this.source[this.index++]))
                    : ++this.index;
                  !this.eof() &&
                  i.Character.isOctalDigit(this.source.charCodeAt(this.index));

                )
                  n += this.source[this.index++];
                return (
                  r || 0 !== n.length || this.throwUnexpectedToken(),
                  (i.Character.isIdentifierStart(
                    this.source.charCodeAt(this.index)
                  ) ||
                    i.Character.isDecimalDigit(
                      this.source.charCodeAt(this.index)
                    )) &&
                    this.throwUnexpectedToken(),
                  {
                    type: 6,
                    value: parseInt(n, 8),
                    octal: r,
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: t,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.isImplicitOctalLiteral = function () {
                for (var e = this.index + 1; e < this.length; ++e) {
                  var t = this.source[e];
                  if ("8" === t || "9" === t) return !1;
                  if (!i.Character.isOctalDigit(t.charCodeAt(0))) return !0;
                }
                return !0;
              }),
              (e.prototype.scanNumericLiteral = function () {
                var e = this.index,
                  t = this.source[e];
                r.assert(
                  i.Character.isDecimalDigit(t.charCodeAt(0)) || "." === t,
                  "Numeric literal must start with a decimal digit or a decimal point"
                );
                var n = "";
                if ("." !== t) {
                  if (
                    ((n = this.source[this.index++]),
                    (t = this.source[this.index]),
                    "0" === n)
                  ) {
                    if ("x" === t || "X" === t)
                      return ++this.index, this.scanHexLiteral(e);
                    if ("b" === t || "B" === t)
                      return ++this.index, this.scanBinaryLiteral(e);
                    if ("o" === t || "O" === t)
                      return this.scanOctalLiteral(t, e);
                    if (
                      t &&
                      i.Character.isOctalDigit(t.charCodeAt(0)) &&
                      this.isImplicitOctalLiteral()
                    )
                      return this.scanOctalLiteral(t, e);
                  }
                  for (
                    ;
                    i.Character.isDecimalDigit(
                      this.source.charCodeAt(this.index)
                    );

                  )
                    n += this.source[this.index++];
                  t = this.source[this.index];
                }
                if ("." === t) {
                  for (
                    n += this.source[this.index++];
                    i.Character.isDecimalDigit(
                      this.source.charCodeAt(this.index)
                    );

                  )
                    n += this.source[this.index++];
                  t = this.source[this.index];
                }
                if ("e" === t || "E" === t)
                  if (
                    ((n += this.source[this.index++]),
                    ("+" !== (t = this.source[this.index]) && "-" !== t) ||
                      (n += this.source[this.index++]),
                    i.Character.isDecimalDigit(
                      this.source.charCodeAt(this.index)
                    ))
                  )
                    for (
                      ;
                      i.Character.isDecimalDigit(
                        this.source.charCodeAt(this.index)
                      );

                    )
                      n += this.source[this.index++];
                  else this.throwUnexpectedToken();
                return (
                  i.Character.isIdentifierStart(
                    this.source.charCodeAt(this.index)
                  ) && this.throwUnexpectedToken(),
                  {
                    type: 6,
                    value: parseFloat(n),
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: e,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.scanStringLiteral = function () {
                var e = this.index,
                  t = this.source[e];
                r.assert(
                  "'" === t || '"' === t,
                  "String literal must starts with a quote"
                ),
                  ++this.index;
                for (var n = !1, o = ""; !this.eof(); ) {
                  var a = this.source[this.index++];
                  if (a === t) {
                    t = "";
                    break;
                  }
                  if ("\\" === a)
                    if (
                      (a = this.source[this.index++]) &&
                      i.Character.isLineTerminator(a.charCodeAt(0))
                    )
                      ++this.lineNumber,
                        "\r" === a &&
                          "\n" === this.source[this.index] &&
                          ++this.index,
                        (this.lineStart = this.index);
                    else
                      switch (a) {
                        case "u":
                          if ("{" === this.source[this.index])
                            ++this.index,
                              (o += this.scanUnicodeCodePointEscape());
                          else {
                            var u = this.scanHexEscape(a);
                            null === u && this.throwUnexpectedToken(), (o += u);
                          }
                          break;
                        case "x":
                          var c = this.scanHexEscape(a);
                          null === c &&
                            this.throwUnexpectedToken(
                              s.Messages.InvalidHexEscapeSequence
                            ),
                            (o += c);
                          break;
                        case "n":
                          o += "\n";
                          break;
                        case "r":
                          o += "\r";
                          break;
                        case "t":
                          o += "\t";
                          break;
                        case "b":
                          o += "\b";
                          break;
                        case "f":
                          o += "\f";
                          break;
                        case "v":
                          o += "\v";
                          break;
                        case "8":
                        case "9":
                          (o += a), this.tolerateUnexpectedToken();
                          break;
                        default:
                          if (a && i.Character.isOctalDigit(a.charCodeAt(0))) {
                            var l = this.octalToDecimal(a);
                            (n = l.octal || n),
                              (o += String.fromCharCode(l.code));
                          } else o += a;
                      }
                  else {
                    if (i.Character.isLineTerminator(a.charCodeAt(0))) break;
                    o += a;
                  }
                }
                return (
                  "" !== t && ((this.index = e), this.throwUnexpectedToken()),
                  {
                    type: 8,
                    value: o,
                    octal: n,
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: e,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.scanTemplate = function () {
                var e = "",
                  t = !1,
                  n = this.index,
                  r = "`" === this.source[n],
                  o = !1,
                  a = 2;
                for (++this.index; !this.eof(); ) {
                  var u = this.source[this.index++];
                  if ("`" === u) {
                    (a = 1), (o = !0), (t = !0);
                    break;
                  }
                  if ("$" === u) {
                    if ("{" === this.source[this.index]) {
                      this.curlyStack.push("${"), ++this.index, (t = !0);
                      break;
                    }
                    e += u;
                  } else if ("\\" === u)
                    if (
                      ((u = this.source[this.index++]),
                      i.Character.isLineTerminator(u.charCodeAt(0)))
                    )
                      ++this.lineNumber,
                        "\r" === u &&
                          "\n" === this.source[this.index] &&
                          ++this.index,
                        (this.lineStart = this.index);
                    else
                      switch (u) {
                        case "n":
                          e += "\n";
                          break;
                        case "r":
                          e += "\r";
                          break;
                        case "t":
                          e += "\t";
                          break;
                        case "u":
                          if ("{" === this.source[this.index])
                            ++this.index,
                              (e += this.scanUnicodeCodePointEscape());
                          else {
                            var c = this.index,
                              l = this.scanHexEscape(u);
                            null !== l
                              ? (e += l)
                              : ((this.index = c), (e += u));
                          }
                          break;
                        case "x":
                          var h = this.scanHexEscape(u);
                          null === h &&
                            this.throwUnexpectedToken(
                              s.Messages.InvalidHexEscapeSequence
                            ),
                            (e += h);
                          break;
                        case "b":
                          e += "\b";
                          break;
                        case "f":
                          e += "\f";
                          break;
                        case "v":
                          e += "\v";
                          break;
                        default:
                          "0" === u
                            ? (i.Character.isDecimalDigit(
                                this.source.charCodeAt(this.index)
                              ) &&
                                this.throwUnexpectedToken(
                                  s.Messages.TemplateOctalLiteral
                                ),
                              (e += "\0"))
                            : i.Character.isOctalDigit(u.charCodeAt(0))
                            ? this.throwUnexpectedToken(
                                s.Messages.TemplateOctalLiteral
                              )
                            : (e += u);
                      }
                  else
                    i.Character.isLineTerminator(u.charCodeAt(0))
                      ? (++this.lineNumber,
                        "\r" === u &&
                          "\n" === this.source[this.index] &&
                          ++this.index,
                        (this.lineStart = this.index),
                        (e += "\n"))
                      : (e += u);
                }
                return (
                  t || this.throwUnexpectedToken(),
                  r || this.curlyStack.pop(),
                  {
                    type: 10,
                    value: this.source.slice(n + 1, this.index - a),
                    cooked: e,
                    head: r,
                    tail: o,
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: n,
                    end: this.index,
                  }
                );
              }),
              (e.prototype.testRegExp = function (e, t) {
                var n = e,
                  r = this;
                t.indexOf("u") >= 0 &&
                  (n = n
                    .replace(
                      /\\u\{([0-9a-fA-F]+)\}|\\u([a-fA-F0-9]{4})/g,
                      function (e, t, n) {
                        var i = parseInt(t || n, 16);
                        return (
                          i > 1114111 &&
                            r.throwUnexpectedToken(s.Messages.InvalidRegExp),
                          i <= 65535 ? String.fromCharCode(i) : "￿"
                        );
                      }
                    )
                    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "￿"));
                try {
                  RegExp(n);
                } catch (e) {
                  this.throwUnexpectedToken(s.Messages.InvalidRegExp);
                }
                try {
                  return new RegExp(e, t);
                } catch (e) {
                  return null;
                }
              }),
              (e.prototype.scanRegExpBody = function () {
                var e = this.source[this.index];
                r.assert(
                  "/" === e,
                  "Regular expression literal must start with a slash"
                );
                for (
                  var t = this.source[this.index++], n = !1, o = !1;
                  !this.eof();

                )
                  if (((t += e = this.source[this.index++]), "\\" === e))
                    (e = this.source[this.index++]),
                      i.Character.isLineTerminator(e.charCodeAt(0)) &&
                        this.throwUnexpectedToken(
                          s.Messages.UnterminatedRegExp
                        ),
                      (t += e);
                  else if (i.Character.isLineTerminator(e.charCodeAt(0)))
                    this.throwUnexpectedToken(s.Messages.UnterminatedRegExp);
                  else if (n) "]" === e && (n = !1);
                  else {
                    if ("/" === e) {
                      o = !0;
                      break;
                    }
                    "[" === e && (n = !0);
                  }
                return (
                  o || this.throwUnexpectedToken(s.Messages.UnterminatedRegExp),
                  t.substr(1, t.length - 2)
                );
              }),
              (e.prototype.scanRegExpFlags = function () {
                for (var e = ""; !this.eof(); ) {
                  var t = this.source[this.index];
                  if (!i.Character.isIdentifierPart(t.charCodeAt(0))) break;
                  if ((++this.index, "\\" !== t || this.eof())) e += t;
                  else if ("u" === (t = this.source[this.index])) {
                    ++this.index;
                    var n = this.index,
                      r = this.scanHexEscape("u");
                    if (null !== r)
                      for (e += r; n < this.index; ++n) this.source[n];
                    else (this.index = n), (e += "u");
                    this.tolerateUnexpectedToken();
                  } else this.tolerateUnexpectedToken();
                }
                return e;
              }),
              (e.prototype.scanRegExp = function () {
                var e = this.index,
                  t = this.scanRegExpBody(),
                  n = this.scanRegExpFlags();
                return {
                  type: 9,
                  value: "",
                  pattern: t,
                  flags: n,
                  regex: this.testRegExp(t, n),
                  lineNumber: this.lineNumber,
                  lineStart: this.lineStart,
                  start: e,
                  end: this.index,
                };
              }),
              (e.prototype.lex = function () {
                if (this.eof())
                  return {
                    type: 2,
                    value: "",
                    lineNumber: this.lineNumber,
                    lineStart: this.lineStart,
                    start: this.index,
                    end: this.index,
                  };
                var e = this.source.charCodeAt(this.index);
                return i.Character.isIdentifierStart(e)
                  ? this.scanIdentifier()
                  : 40 === e || 41 === e || 59 === e
                  ? this.scanPunctuator()
                  : 39 === e || 34 === e
                  ? this.scanStringLiteral()
                  : 46 === e
                  ? i.Character.isDecimalDigit(
                      this.source.charCodeAt(this.index + 1)
                    )
                    ? this.scanNumericLiteral()
                    : this.scanPunctuator()
                  : i.Character.isDecimalDigit(e)
                  ? this.scanNumericLiteral()
                  : 96 === e ||
                    (125 === e &&
                      "${" === this.curlyStack[this.curlyStack.length - 1])
                  ? this.scanTemplate()
                  : e >= 55296 &&
                    e < 57343 &&
                    i.Character.isIdentifierStart(this.codePointAt(this.index))
                  ? this.scanIdentifier()
                  : this.scanPunctuator();
              }),
              e
            );
          })();
          t.Scanner = u;
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 }),
            (t.TokenName = {}),
            (t.TokenName[1] = "Boolean"),
            (t.TokenName[2] = "<end>"),
            (t.TokenName[3] = "Identifier"),
            (t.TokenName[4] = "Keyword"),
            (t.TokenName[5] = "Null"),
            (t.TokenName[6] = "Numeric"),
            (t.TokenName[7] = "Punctuator"),
            (t.TokenName[8] = "String"),
            (t.TokenName[9] = "RegularExpression"),
            (t.TokenName[10] = "Template");
        },
        function (e, t) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 }),
            (t.XHTMLEntities = {
              quot: '"',
              amp: "&",
              apos: "'",
              gt: ">",
              nbsp: " ",
              iexcl: "¡",
              cent: "¢",
              pound: "£",
              curren: "¤",
              yen: "¥",
              brvbar: "¦",
              sect: "§",
              uml: "¨",
              copy: "©",
              ordf: "ª",
              laquo: "«",
              not: "¬",
              shy: "­",
              reg: "®",
              macr: "¯",
              deg: "°",
              plusmn: "±",
              sup2: "²",
              sup3: "³",
              acute: "´",
              micro: "µ",
              para: "¶",
              middot: "·",
              cedil: "¸",
              sup1: "¹",
              ordm: "º",
              raquo: "»",
              frac14: "¼",
              frac12: "½",
              frac34: "¾",
              iquest: "¿",
              Agrave: "À",
              Aacute: "Á",
              Acirc: "Â",
              Atilde: "Ã",
              Auml: "Ä",
              Aring: "Å",
              AElig: "Æ",
              Ccedil: "Ç",
              Egrave: "È",
              Eacute: "É",
              Ecirc: "Ê",
              Euml: "Ë",
              Igrave: "Ì",
              Iacute: "Í",
              Icirc: "Î",
              Iuml: "Ï",
              ETH: "Ð",
              Ntilde: "Ñ",
              Ograve: "Ò",
              Oacute: "Ó",
              Ocirc: "Ô",
              Otilde: "Õ",
              Ouml: "Ö",
              times: "×",
              Oslash: "Ø",
              Ugrave: "Ù",
              Uacute: "Ú",
              Ucirc: "Û",
              Uuml: "Ü",
              Yacute: "Ý",
              THORN: "Þ",
              szlig: "ß",
              agrave: "à",
              aacute: "á",
              acirc: "â",
              atilde: "ã",
              auml: "ä",
              aring: "å",
              aelig: "æ",
              ccedil: "ç",
              egrave: "è",
              eacute: "é",
              ecirc: "ê",
              euml: "ë",
              igrave: "ì",
              iacute: "í",
              icirc: "î",
              iuml: "ï",
              eth: "ð",
              ntilde: "ñ",
              ograve: "ò",
              oacute: "ó",
              ocirc: "ô",
              otilde: "õ",
              ouml: "ö",
              divide: "÷",
              oslash: "ø",
              ugrave: "ù",
              uacute: "ú",
              ucirc: "û",
              uuml: "ü",
              yacute: "ý",
              thorn: "þ",
              yuml: "ÿ",
              OElig: "Œ",
              oelig: "œ",
              Scaron: "Š",
              scaron: "š",
              Yuml: "Ÿ",
              fnof: "ƒ",
              circ: "ˆ",
              tilde: "˜",
              Alpha: "Α",
              Beta: "Β",
              Gamma: "Γ",
              Delta: "Δ",
              Epsilon: "Ε",
              Zeta: "Ζ",
              Eta: "Η",
              Theta: "Θ",
              Iota: "Ι",
              Kappa: "Κ",
              Lambda: "Λ",
              Mu: "Μ",
              Nu: "Ν",
              Xi: "Ξ",
              Omicron: "Ο",
              Pi: "Π",
              Rho: "Ρ",
              Sigma: "Σ",
              Tau: "Τ",
              Upsilon: "Υ",
              Phi: "Φ",
              Chi: "Χ",
              Psi: "Ψ",
              Omega: "Ω",
              alpha: "α",
              beta: "β",
              gamma: "γ",
              delta: "δ",
              epsilon: "ε",
              zeta: "ζ",
              eta: "η",
              theta: "θ",
              iota: "ι",
              kappa: "κ",
              lambda: "λ",
              mu: "μ",
              nu: "ν",
              xi: "ξ",
              omicron: "ο",
              pi: "π",
              rho: "ρ",
              sigmaf: "ς",
              sigma: "σ",
              tau: "τ",
              upsilon: "υ",
              phi: "φ",
              chi: "χ",
              psi: "ψ",
              omega: "ω",
              thetasym: "ϑ",
              upsih: "ϒ",
              piv: "ϖ",
              ensp: " ",
              emsp: " ",
              thinsp: " ",
              zwnj: "‌",
              zwj: "‍",
              lrm: "‎",
              rlm: "‏",
              ndash: "–",
              mdash: "—",
              lsquo: "‘",
              rsquo: "’",
              sbquo: "‚",
              ldquo: "“",
              rdquo: "”",
              bdquo: "„",
              dagger: "†",
              Dagger: "‡",
              bull: "•",
              hellip: "…",
              permil: "‰",
              prime: "′",
              Prime: "″",
              lsaquo: "‹",
              rsaquo: "›",
              oline: "‾",
              frasl: "⁄",
              euro: "€",
              image: "ℑ",
              weierp: "℘",
              real: "ℜ",
              trade: "™",
              alefsym: "ℵ",
              larr: "←",
              uarr: "↑",
              rarr: "→",
              darr: "↓",
              harr: "↔",
              crarr: "↵",
              lArr: "⇐",
              uArr: "⇑",
              rArr: "⇒",
              dArr: "⇓",
              hArr: "⇔",
              forall: "∀",
              part: "∂",
              exist: "∃",
              empty: "∅",
              nabla: "∇",
              isin: "∈",
              notin: "∉",
              ni: "∋",
              prod: "∏",
              sum: "∑",
              minus: "−",
              lowast: "∗",
              radic: "√",
              prop: "∝",
              infin: "∞",
              ang: "∠",
              and: "∧",
              or: "∨",
              cap: "∩",
              cup: "∪",
              int: "∫",
              there4: "∴",
              sim: "∼",
              cong: "≅",
              asymp: "≈",
              ne: "≠",
              equiv: "≡",
              le: "≤",
              ge: "≥",
              sub: "⊂",
              sup: "⊃",
              nsub: "⊄",
              sube: "⊆",
              supe: "⊇",
              oplus: "⊕",
              otimes: "⊗",
              perp: "⊥",
              sdot: "⋅",
              lceil: "⌈",
              rceil: "⌉",
              lfloor: "⌊",
              rfloor: "⌋",
              loz: "◊",
              spades: "♠",
              clubs: "♣",
              hearts: "♥",
              diams: "♦",
              lang: "⟨",
              rang: "⟩",
            });
        },
        function (e, t, n) {
          "use strict";
          Object.defineProperty(t, "__esModule", { value: !0 });
          var r = n(10),
            i = n(12),
            s = n(13),
            o = (function () {
              function e() {
                (this.values = []), (this.curly = this.paren = -1);
              }
              return (
                (e.prototype.beforeFunctionExpression = function (e) {
                  return (
                    [
                      "(",
                      "{",
                      "[",
                      "in",
                      "typeof",
                      "instanceof",
                      "new",
                      "return",
                      "case",
                      "delete",
                      "throw",
                      "void",
                      "=",
                      "+=",
                      "-=",
                      "*=",
                      "**=",
                      "/=",
                      "%=",
                      "<<=",
                      ">>=",
                      ">>>=",
                      "&=",
                      "|=",
                      "^=",
                      ",",
                      "+",
                      "-",
                      "*",
                      "**",
                      "/",
                      "%",
                      "++",
                      "--",
                      "<<",
                      ">>",
                      ">>>",
                      "&",
                      "|",
                      "^",
                      "!",
                      "~",
                      "&&",
                      "||",
                      "?",
                      ":",
                      "===",
                      "==",
                      ">=",
                      "<=",
                      "<",
                      ">",
                      "!=",
                      "!==",
                    ].indexOf(e) >= 0
                  );
                }),
                (e.prototype.isRegexStart = function () {
                  var e = this.values[this.values.length - 1],
                    t = null !== e;
                  switch (e) {
                    case "this":
                    case "]":
                      t = !1;
                      break;
                    case ")":
                      var n = this.values[this.paren - 1];
                      t =
                        "if" === n ||
                        "while" === n ||
                        "for" === n ||
                        "with" === n;
                      break;
                    case "}":
                      if (
                        ((t = !1), "function" === this.values[this.curly - 3])
                      )
                        t =
                          !!(r = this.values[this.curly - 4]) &&
                          !this.beforeFunctionExpression(r);
                      else if ("function" === this.values[this.curly - 4]) {
                        var r;
                        t =
                          !(r = this.values[this.curly - 5]) ||
                          !this.beforeFunctionExpression(r);
                      }
                  }
                  return t;
                }),
                (e.prototype.push = function (e) {
                  7 === e.type || 4 === e.type
                    ? ("{" === e.value
                        ? (this.curly = this.values.length)
                        : "(" === e.value && (this.paren = this.values.length),
                      this.values.push(e.value))
                    : this.values.push(null);
                }),
                e
              );
            })(),
            a = (function () {
              function e(e, t) {
                (this.errorHandler = new r.ErrorHandler()),
                  (this.errorHandler.tolerant =
                    !!t && "boolean" == typeof t.tolerant && t.tolerant),
                  (this.scanner = new i.Scanner(e, this.errorHandler)),
                  (this.scanner.trackComment =
                    !!t && "boolean" == typeof t.comment && t.comment),
                  (this.trackRange =
                    !!t && "boolean" == typeof t.range && t.range),
                  (this.trackLoc = !!t && "boolean" == typeof t.loc && t.loc),
                  (this.buffer = []),
                  (this.reader = new o());
              }
              return (
                (e.prototype.errors = function () {
                  return this.errorHandler.errors;
                }),
                (e.prototype.getNextToken = function () {
                  if (0 === this.buffer.length) {
                    var e = this.scanner.scanComments();
                    if (this.scanner.trackComment)
                      for (var t = 0; t < e.length; ++t) {
                        var n = e[t],
                          r = this.scanner.source.slice(n.slice[0], n.slice[1]),
                          i = {
                            type: n.multiLine ? "BlockComment" : "LineComment",
                            value: r,
                          };
                        this.trackRange && (i.range = n.range),
                          this.trackLoc && (i.loc = n.loc),
                          this.buffer.push(i);
                      }
                    if (!this.scanner.eof()) {
                      var o = void 0;
                      this.trackLoc &&
                        (o = {
                          start: {
                            line: this.scanner.lineNumber,
                            column: this.scanner.index - this.scanner.lineStart,
                          },
                          end: {},
                        });
                      var a =
                        "/" === this.scanner.source[this.scanner.index] &&
                        this.reader.isRegexStart()
                          ? this.scanner.scanRegExp()
                          : this.scanner.lex();
                      this.reader.push(a);
                      var u = {
                        type: s.TokenName[a.type],
                        value: this.scanner.source.slice(a.start, a.end),
                      };
                      if (
                        (this.trackRange && (u.range = [a.start, a.end]),
                        this.trackLoc &&
                          ((o.end = {
                            line: this.scanner.lineNumber,
                            column: this.scanner.index - this.scanner.lineStart,
                          }),
                          (u.loc = o)),
                        9 === a.type)
                      ) {
                        var c = a.pattern,
                          l = a.flags;
                        u.regex = { pattern: c, flags: l };
                      }
                      this.buffer.push(u);
                    }
                  }
                  return this.buffer.shift();
                }),
                e
              );
            })();
          t.Tokenizer = a;
        },
      ]);
    }),
      (e.exports = r());
  },
  "./node_modules/fs-extra/lib/copy-sync/copy-sync.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js"),
      i = n("path"),
      s = n("./node_modules/fs-extra/lib/mkdirs/index.js").mkdirsSync,
      o = n("./node_modules/fs-extra/lib/util/utimes.js").utimesMillisSync,
      a = n("./node_modules/fs-extra/lib/util/stat.js");
    function u(e, t, n, s) {
      if (!s.filter || s.filter(t, n))
        return (function (e, t, n, s) {
          const o = (s.dereference ? r.statSync : r.lstatSync)(t);
          if (o.isDirectory())
            return (function (e, t, n, i, s) {
              if (!t)
                return (function (e, t, n, i) {
                  return r.mkdirSync(n), h(t, n, i), l(n, e);
                })(e.mode, n, i, s);
              if (t && !t.isDirectory())
                throw new Error(
                  `Cannot overwrite non-directory '${i}' with directory '${n}'.`
                );
              return h(n, i, s);
            })(o, e, t, n, s);
          if (o.isFile() || o.isCharacterDevice() || o.isBlockDevice())
            return (function (e, t, n, i, s) {
              return t
                ? (function (e, t, n, i) {
                    if (i.overwrite) return r.unlinkSync(n), c(e, t, n, i);
                    if (i.errorOnExist)
                      throw new Error(`'${n}' already exists`);
                  })(e, n, i, s)
                : c(e, n, i, s);
            })(o, e, t, n, s);
          if (o.isSymbolicLink())
            return (function (e, t, n, s) {
              let o = r.readlinkSync(t);
              s.dereference && (o = i.resolve(process.cwd(), o));
              if (e) {
                let e;
                try {
                  e = r.readlinkSync(n);
                } catch (e) {
                  if ("EINVAL" === e.code || "UNKNOWN" === e.code)
                    return r.symlinkSync(o, n);
                  throw e;
                }
                if (
                  (s.dereference && (e = i.resolve(process.cwd(), e)),
                  a.isSrcSubdir(o, e))
                )
                  throw new Error(
                    `Cannot copy '${o}' to a subdirectory of itself, '${e}'.`
                  );
                if (r.statSync(n).isDirectory() && a.isSrcSubdir(e, o))
                  throw new Error(`Cannot overwrite '${e}' with '${o}'.`);
                return (function (e, t) {
                  return r.unlinkSync(t), r.symlinkSync(e, t);
                })(o, n);
              }
              return r.symlinkSync(o, n);
            })(e, t, n, s);
        })(e, t, n, s);
    }
    function c(e, t, n, i) {
      return (
        r.copyFileSync(t, n),
        i.preserveTimestamps &&
          (function (e, t, n) {
            (function (e) {
              return 0 == (128 & e);
            })(e) &&
              (function (e, t) {
                l(e, 128 | t);
              })(n, e);
            (function (e, t) {
              const n = r.statSync(e);
              o(t, n.atime, n.mtime);
            })(t, n);
          })(e.mode, t, n),
        l(n, e.mode)
      );
    }
    function l(e, t) {
      return r.chmodSync(e, t);
    }
    function h(e, t, n) {
      r.readdirSync(e).forEach((r) =>
        (function (e, t, n, r) {
          const s = i.join(t, e),
            o = i.join(n, e),
            { destStat: c } = a.checkPathsSync(s, o, "copy");
          return u(c, s, o, r);
        })(r, e, t, n)
      );
    }
    e.exports = function (e, t, n) {
      "function" == typeof n && (n = { filter: n }),
        ((n = n || {}).clobber = !("clobber" in n) || !!n.clobber),
        (n.overwrite = "overwrite" in n ? !!n.overwrite : n.clobber),
        n.preserveTimestamps &&
          "ia32" === process.arch &&
          console.warn(
            "fs-extra: Using the preserveTimestamps option in 32-bit node is not recommended;\n\n    see https://github.com/jprichardson/node-fs-extra/issues/269"
          );
      const { srcStat: o, destStat: c } = a.checkPathsSync(e, t, "copy");
      return (
        a.checkParentPathsSync(e, o, t, "copy"),
        (function (e, t, n, o) {
          if (o.filter && !o.filter(t, n)) return;
          const a = i.dirname(n);
          r.existsSync(a) || s(a);
          return u(e, t, n, o);
        })(c, e, t, n)
      );
    };
  },
  "./node_modules/fs-extra/lib/copy-sync/index.js": function (e, t, n) {
    "use strict";
    e.exports = {
      copySync: n("./node_modules/fs-extra/lib/copy-sync/copy-sync.js"),
    };
  },
  "./node_modules/fs-extra/lib/copy/copy.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js"),
      i = n("path"),
      s = n("./node_modules/fs-extra/lib/mkdirs/index.js").mkdirs,
      o = n("./node_modules/fs-extra/lib/path-exists/index.js").pathExists,
      a = n("./node_modules/fs-extra/lib/util/utimes.js").utimesMillis,
      u = n("./node_modules/fs-extra/lib/util/stat.js");
    function c(e, t, n, r, a) {
      const u = i.dirname(n);
      o(u, (i, o) =>
        i
          ? a(i)
          : o
          ? h(e, t, n, r, a)
          : void s(u, (i) => (i ? a(i) : h(e, t, n, r, a)))
      );
    }
    function l(e, t, n, r, i, s) {
      Promise.resolve(i.filter(n, r)).then(
        (o) => (o ? e(t, n, r, i, s) : s()),
        (e) => s(e)
      );
    }
    function h(e, t, n, r, i) {
      return r.filter ? l(d, e, t, n, r, i) : d(e, t, n, r, i);
    }
    function d(e, t, n, i, s) {
      (i.dereference ? r.stat : r.lstat)(t, (o, a) =>
        o
          ? s(o)
          : a.isDirectory()
          ? (function (e, t, n, i, s, o) {
              if (!t)
                return (function (e, t, n, i, s) {
                  r.mkdir(n, (r) => {
                    if (r) return s(r);
                    g(t, n, i, (t) => (t ? s(t) : m(n, e, s)));
                  });
                })(e.mode, n, i, s, o);
              if (t && !t.isDirectory())
                return o(
                  new Error(
                    `Cannot overwrite non-directory '${i}' with directory '${n}'.`
                  )
                );
              return g(n, i, s, o);
            })(a, e, t, n, i, s)
          : a.isFile() || a.isCharacterDevice() || a.isBlockDevice()
          ? (function (e, t, n, i, s, o) {
              return t
                ? (function (e, t, n, i, s) {
                    if (!i.overwrite)
                      return i.errorOnExist
                        ? s(new Error(`'${n}' already exists`))
                        : s();
                    r.unlink(n, (r) => (r ? s(r) : p(e, t, n, i, s)));
                  })(e, n, i, s, o)
                : p(e, n, i, s, o);
            })(a, e, t, n, i, s)
          : a.isSymbolicLink()
          ? v(e, t, n, i, s)
          : void 0
      );
    }
    function p(e, t, n, i, s) {
      r.copyFile(t, n, (r) =>
        r
          ? s(r)
          : i.preserveTimestamps
          ? (function (e, t, n, r) {
              if (
                (function (e) {
                  return 0 == (128 & e);
                })(e)
              )
                return (function (e, t, n) {
                  return m(e, 128 | t, n);
                })(n, e, (i) => (i ? r(i) : f(e, t, n, r)));
              return f(e, t, n, r);
            })(e.mode, t, n, s)
          : m(n, e.mode, s)
      );
    }
    function f(e, t, n, i) {
      !(function (e, t, n) {
        r.stat(e, (e, r) => (e ? n(e) : a(t, r.atime, r.mtime, n)));
      })(t, n, (t) => (t ? i(t) : m(n, e, i)));
    }
    function m(e, t, n) {
      return r.chmod(e, t, n);
    }
    function g(e, t, n, i) {
      r.readdir(e, (r, s) => (r ? i(r) : y(s, e, t, n, i)));
    }
    function y(e, t, n, r, s) {
      const o = e.pop();
      return o
        ? (function (e, t, n, r, s, o) {
            const a = i.join(n, t),
              c = i.join(r, t);
            u.checkPaths(a, c, "copy", (t, i) => {
              if (t) return o(t);
              const { destStat: u } = i;
              h(u, a, c, s, (t) => (t ? o(t) : y(e, n, r, s, o)));
            });
          })(e, o, t, n, r, s)
        : s();
    }
    function v(e, t, n, s, o) {
      r.readlink(t, (t, a) =>
        t
          ? o(t)
          : (s.dereference && (a = i.resolve(process.cwd(), a)),
            e
              ? void r.readlink(n, (t, c) =>
                  t
                    ? "EINVAL" === t.code || "UNKNOWN" === t.code
                      ? r.symlink(a, n, o)
                      : o(t)
                    : (s.dereference && (c = i.resolve(process.cwd(), c)),
                      u.isSrcSubdir(a, c)
                        ? o(
                            new Error(
                              `Cannot copy '${a}' to a subdirectory of itself, '${c}'.`
                            )
                          )
                        : e.isDirectory() && u.isSrcSubdir(c, a)
                        ? o(new Error(`Cannot overwrite '${c}' with '${a}'.`))
                        : (function (e, t, n) {
                            r.unlink(t, (i) => (i ? n(i) : r.symlink(e, t, n)));
                          })(a, n, o))
                )
              : r.symlink(a, n, o))
      );
    }
    e.exports = function (e, t, n, r) {
      "function" != typeof n || r
        ? "function" == typeof n && (n = { filter: n })
        : ((r = n), (n = {})),
        (r = r || function () {}),
        ((n = n || {}).clobber = !("clobber" in n) || !!n.clobber),
        (n.overwrite = "overwrite" in n ? !!n.overwrite : n.clobber),
        n.preserveTimestamps &&
          "ia32" === process.arch &&
          console.warn(
            "fs-extra: Using the preserveTimestamps option in 32-bit node is not recommended;\n\n    see https://github.com/jprichardson/node-fs-extra/issues/269"
          ),
        u.checkPaths(e, t, "copy", (i, s) => {
          if (i) return r(i);
          const { srcStat: o, destStat: a } = s;
          u.checkParentPaths(e, o, t, "copy", (i) =>
            i ? r(i) : n.filter ? l(c, a, e, t, n, r) : c(a, e, t, n, r)
          );
        });
    };
  },
  "./node_modules/fs-extra/lib/copy/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
      .fromCallback;
    e.exports = { copy: r(n("./node_modules/fs-extra/lib/copy/copy.js")) };
  },
  "./node_modules/fs-extra/lib/empty/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("./node_modules/graceful-fs/graceful-fs.js"),
      s = n("path"),
      o = n("./node_modules/fs-extra/lib/mkdirs/index.js"),
      a = n("./node_modules/fs-extra/lib/remove/index.js"),
      u = r(function (e, t) {
        (t = t || function () {}),
          i.readdir(e, (n, r) => {
            if (n) return o.mkdirs(e, t);
            (r = r.map((t) => s.join(e, t))),
              (function e() {
                const n = r.pop();
                if (!n) return t();
                a.remove(n, (n) => {
                  if (n) return t(n);
                  e();
                });
              })();
          });
      });
    function c(e) {
      let t;
      try {
        t = i.readdirSync(e);
      } catch {
        return o.mkdirsSync(e);
      }
      t.forEach((t) => {
        (t = s.join(e, t)), a.removeSync(t);
      });
    }
    e.exports = { emptyDirSync: c, emptydirSync: c, emptyDir: u, emptydir: u };
  },
  "./node_modules/fs-extra/lib/ensure/file.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("path"),
      s = n("./node_modules/graceful-fs/graceful-fs.js"),
      o = n("./node_modules/fs-extra/lib/mkdirs/index.js");
    e.exports = {
      createFile: r(function (e, t) {
        function n() {
          s.writeFile(e, "", (e) => {
            if (e) return t(e);
            t();
          });
        }
        s.stat(e, (r, a) => {
          if (!r && a.isFile()) return t();
          const u = i.dirname(e);
          s.stat(u, (e, r) => {
            if (e)
              return "ENOENT" === e.code
                ? o.mkdirs(u, (e) => {
                    if (e) return t(e);
                    n();
                  })
                : t(e);
            r.isDirectory()
              ? n()
              : s.readdir(u, (e) => {
                  if (e) return t(e);
                });
          });
        });
      }),
      createFileSync: function (e) {
        let t;
        try {
          t = s.statSync(e);
        } catch {}
        if (t && t.isFile()) return;
        const n = i.dirname(e);
        try {
          s.statSync(n).isDirectory() || s.readdirSync(n);
        } catch (e) {
          if (!e || "ENOENT" !== e.code) throw e;
          o.mkdirsSync(n);
        }
        s.writeFileSync(e, "");
      },
    };
  },
  "./node_modules/fs-extra/lib/ensure/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/lib/ensure/file.js"),
      i = n("./node_modules/fs-extra/lib/ensure/link.js"),
      s = n("./node_modules/fs-extra/lib/ensure/symlink.js");
    e.exports = {
      createFile: r.createFile,
      createFileSync: r.createFileSync,
      ensureFile: r.createFile,
      ensureFileSync: r.createFileSync,
      createLink: i.createLink,
      createLinkSync: i.createLinkSync,
      ensureLink: i.createLink,
      ensureLinkSync: i.createLinkSync,
      createSymlink: s.createSymlink,
      createSymlinkSync: s.createSymlinkSync,
      ensureSymlink: s.createSymlink,
      ensureSymlinkSync: s.createSymlinkSync,
    };
  },
  "./node_modules/fs-extra/lib/ensure/link.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("path"),
      s = n("./node_modules/graceful-fs/graceful-fs.js"),
      o = n("./node_modules/fs-extra/lib/mkdirs/index.js"),
      a = n("./node_modules/fs-extra/lib/path-exists/index.js").pathExists;
    e.exports = {
      createLink: r(function (e, t, n) {
        function r(e, t) {
          s.link(e, t, (e) => {
            if (e) return n(e);
            n(null);
          });
        }
        a(t, (u, c) =>
          u
            ? n(u)
            : c
            ? n(null)
            : void s.lstat(e, (s) => {
                if (s)
                  return (
                    (s.message = s.message.replace("lstat", "ensureLink")), n(s)
                  );
                const u = i.dirname(t);
                a(u, (i, s) =>
                  i
                    ? n(i)
                    : s
                    ? r(e, t)
                    : void o.mkdirs(u, (i) => {
                        if (i) return n(i);
                        r(e, t);
                      })
                );
              })
        );
      }),
      createLinkSync: function (e, t) {
        if (s.existsSync(t)) return;
        try {
          s.lstatSync(e);
        } catch (e) {
          throw ((e.message = e.message.replace("lstat", "ensureLink")), e);
        }
        const n = i.dirname(t);
        return s.existsSync(n) || o.mkdirsSync(n), s.linkSync(e, t);
      },
    };
  },
  "./node_modules/fs-extra/lib/ensure/symlink-paths.js": function (e, t, n) {
    "use strict";
    const r = n("path"),
      i = n("./node_modules/graceful-fs/graceful-fs.js"),
      s = n("./node_modules/fs-extra/lib/path-exists/index.js").pathExists;
    e.exports = {
      symlinkPaths: function (e, t, n) {
        if (r.isAbsolute(e))
          return i.lstat(e, (t) =>
            t
              ? ((t.message = t.message.replace("lstat", "ensureSymlink")),
                n(t))
              : n(null, { toCwd: e, toDst: e })
          );
        {
          const o = r.dirname(t),
            a = r.join(o, e);
          return s(a, (t, s) =>
            t
              ? n(t)
              : s
              ? n(null, { toCwd: a, toDst: e })
              : i.lstat(e, (t) =>
                  t
                    ? ((t.message = t.message.replace(
                        "lstat",
                        "ensureSymlink"
                      )),
                      n(t))
                    : n(null, { toCwd: e, toDst: r.relative(o, e) })
                )
          );
        }
      },
      symlinkPathsSync: function (e, t) {
        let n;
        if (r.isAbsolute(e)) {
          if (((n = i.existsSync(e)), !n))
            throw new Error("absolute srcpath does not exist");
          return { toCwd: e, toDst: e };
        }
        {
          const s = r.dirname(t),
            o = r.join(s, e);
          if (((n = i.existsSync(o)), n)) return { toCwd: o, toDst: e };
          if (((n = i.existsSync(e)), !n))
            throw new Error("relative srcpath does not exist");
          return { toCwd: e, toDst: r.relative(s, e) };
        }
      },
    };
  },
  "./node_modules/fs-extra/lib/ensure/symlink-type.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js");
    e.exports = {
      symlinkType: function (e, t, n) {
        if (
          ((n = "function" == typeof t ? t : n),
          (t = "function" != typeof t && t))
        )
          return n(null, t);
        r.lstat(e, (e, r) => {
          if (e) return n(null, "file");
          (t = r && r.isDirectory() ? "dir" : "file"), n(null, t);
        });
      },
      symlinkTypeSync: function (e, t) {
        let n;
        if (t) return t;
        try {
          n = r.lstatSync(e);
        } catch {
          return "file";
        }
        return n && n.isDirectory() ? "dir" : "file";
      },
    };
  },
  "./node_modules/fs-extra/lib/ensure/symlink.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("path"),
      s = n("./node_modules/graceful-fs/graceful-fs.js"),
      o = n("./node_modules/fs-extra/lib/mkdirs/index.js"),
      a = o.mkdirs,
      u = o.mkdirsSync,
      c = n("./node_modules/fs-extra/lib/ensure/symlink-paths.js"),
      l = c.symlinkPaths,
      h = c.symlinkPathsSync,
      d = n("./node_modules/fs-extra/lib/ensure/symlink-type.js"),
      p = d.symlinkType,
      f = d.symlinkTypeSync,
      m = n("./node_modules/fs-extra/lib/path-exists/index.js").pathExists;
    e.exports = {
      createSymlink: r(function (e, t, n, r) {
        (r = "function" == typeof n ? n : r),
          (n = "function" != typeof n && n),
          m(t, (o, u) =>
            o
              ? r(o)
              : u
              ? r(null)
              : void l(e, t, (o, u) => {
                  if (o) return r(o);
                  (e = u.toDst),
                    p(u.toCwd, n, (n, o) => {
                      if (n) return r(n);
                      const u = i.dirname(t);
                      m(u, (n, i) =>
                        n
                          ? r(n)
                          : i
                          ? s.symlink(e, t, o, r)
                          : void a(u, (n) => {
                              if (n) return r(n);
                              s.symlink(e, t, o, r);
                            })
                      );
                    });
                })
          );
      }),
      createSymlinkSync: function (e, t, n) {
        if (s.existsSync(t)) return;
        const r = h(e, t);
        (e = r.toDst), (n = f(r.toCwd, n));
        const o = i.dirname(t);
        return s.existsSync(o) || u(o), s.symlinkSync(e, t, n);
      },
    };
  },
  "./node_modules/fs-extra/lib/fs/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("./node_modules/graceful-fs/graceful-fs.js"),
      s = [
        "access",
        "appendFile",
        "chmod",
        "chown",
        "close",
        "copyFile",
        "fchmod",
        "fchown",
        "fdatasync",
        "fstat",
        "fsync",
        "ftruncate",
        "futimes",
        "lchmod",
        "lchown",
        "link",
        "lstat",
        "mkdir",
        "mkdtemp",
        "open",
        "opendir",
        "readdir",
        "readFile",
        "readlink",
        "realpath",
        "rename",
        "rmdir",
        "stat",
        "symlink",
        "truncate",
        "unlink",
        "utimes",
        "writeFile",
      ].filter((e) => "function" == typeof i[e]);
    Object.keys(i).forEach((e) => {
      "promises" !== e && (t[e] = i[e]);
    }),
      s.forEach((e) => {
        t[e] = r(i[e]);
      }),
      (t.exists = function (e, t) {
        return "function" == typeof t
          ? i.exists(e, t)
          : new Promise((t) => i.exists(e, t));
      }),
      (t.read = function (e, t, n, r, s, o) {
        return "function" == typeof o
          ? i.read(e, t, n, r, s, o)
          : new Promise((o, a) => {
              i.read(e, t, n, r, s, (e, t, n) => {
                if (e) return a(e);
                o({ bytesRead: t, buffer: n });
              });
            });
      }),
      (t.write = function (e, t, ...n) {
        return "function" == typeof n[n.length - 1]
          ? i.write(e, t, ...n)
          : new Promise((r, s) => {
              i.write(e, t, ...n, (e, t, n) => {
                if (e) return s(e);
                r({ bytesWritten: t, buffer: n });
              });
            });
      }),
      "function" == typeof i.writev &&
        (t.writev = function (e, t, ...n) {
          return "function" == typeof n[n.length - 1]
            ? i.writev(e, t, ...n)
            : new Promise((r, s) => {
                i.writev(e, t, ...n, (e, t, n) => {
                  if (e) return s(e);
                  r({ bytesWritten: t, buffers: n });
                });
              });
        }),
      "function" == typeof i.realpath.native &&
        (t.realpath.native = r(i.realpath.native));
  },
  "./node_modules/fs-extra/lib/index.js": function (e, t, n) {
    "use strict";
    e.exports = {
      ...n("./node_modules/fs-extra/lib/fs/index.js"),
      ...n("./node_modules/fs-extra/lib/copy-sync/index.js"),
      ...n("./node_modules/fs-extra/lib/copy/index.js"),
      ...n("./node_modules/fs-extra/lib/empty/index.js"),
      ...n("./node_modules/fs-extra/lib/ensure/index.js"),
      ...n("./node_modules/fs-extra/lib/json/index.js"),
      ...n("./node_modules/fs-extra/lib/mkdirs/index.js"),
      ...n("./node_modules/fs-extra/lib/move-sync/index.js"),
      ...n("./node_modules/fs-extra/lib/move/index.js"),
      ...n("./node_modules/fs-extra/lib/output/index.js"),
      ...n("./node_modules/fs-extra/lib/path-exists/index.js"),
      ...n("./node_modules/fs-extra/lib/remove/index.js"),
    };
    const r = n("fs");
    Object.getOwnPropertyDescriptor(r, "promises") &&
      Object.defineProperty(e.exports, "promises", { get: () => r.promises });
  },
  "./node_modules/fs-extra/lib/json/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromPromise,
      i = n("./node_modules/fs-extra/lib/json/jsonfile.js");
    (i.outputJson = r(n("./node_modules/fs-extra/lib/json/output-json.js"))),
      (i.outputJsonSync = n(
        "./node_modules/fs-extra/lib/json/output-json-sync.js"
      )),
      (i.outputJSON = i.outputJson),
      (i.outputJSONSync = i.outputJsonSync),
      (i.writeJSON = i.writeJson),
      (i.writeJSONSync = i.writeJsonSync),
      (i.readJSON = i.readJson),
      (i.readJSONSync = i.readJsonSync),
      (e.exports = i);
  },
  "./node_modules/fs-extra/lib/json/jsonfile.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/jsonfile/index.js");
    e.exports = {
      readJson: r.readFile,
      readJsonSync: r.readFileSync,
      writeJson: r.writeFile,
      writeJsonSync: r.writeFileSync,
    };
  },
  "./node_modules/fs-extra/lib/json/output-json-sync.js": function (e, t, n) {
    "use strict";
    const { stringify: r } = n(
        "./node_modules/fs-extra/node_modules/jsonfile/utils.js"
      ),
      { outputFileSync: i } = n("./node_modules/fs-extra/lib/output/index.js");
    e.exports = function (e, t, n) {
      const s = r(t, n);
      i(e, s, n);
    };
  },
  "./node_modules/fs-extra/lib/json/output-json.js": function (e, t, n) {
    "use strict";
    const { stringify: r } = n(
        "./node_modules/fs-extra/node_modules/jsonfile/utils.js"
      ),
      { outputFile: i } = n("./node_modules/fs-extra/lib/output/index.js");
    e.exports = async function (e, t, n = {}) {
      const s = r(t, n);
      await i(e, s, n);
    };
  },
  "./node_modules/fs-extra/lib/mkdirs/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromPromise,
      { makeDir: i, makeDirSync: s } = n(
        "./node_modules/fs-extra/lib/mkdirs/make-dir.js"
      ),
      o = r(i);
    e.exports = {
      mkdirs: o,
      mkdirsSync: s,
      mkdirp: o,
      mkdirpSync: s,
      ensureDir: o,
      ensureDirSync: s,
    };
  },
  "./node_modules/fs-extra/lib/mkdirs/make-dir.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/lib/fs/index.js"),
      i = n("path"),
      s = n("./node_modules/at-least-node/index.js")("10.12.0"),
      o = (e) => {
        if ("win32" === process.platform) {
          if (/[<>:"|?*]/.test(e.replace(i.parse(e).root, ""))) {
            const t = new Error("Path contains invalid characters: " + e);
            throw ((t.code = "EINVAL"), t);
          }
        }
      },
      a = (e) => (
        "number" == typeof e && (e = { mode: e }), { mode: 511, ...e }
      ),
      u = (e) => {
        const t = new Error(`operation not permitted, mkdir '${e}'`);
        return (
          (t.code = "EPERM"),
          (t.errno = -4048),
          (t.path = e),
          (t.syscall = "mkdir"),
          t
        );
      };
    (e.exports.makeDir = async (e, t) => {
      if ((o(e), (t = a(t)), s)) {
        const n = i.resolve(e);
        return r.mkdir(n, { mode: t.mode, recursive: !0 });
      }
      const n = async (e) => {
        try {
          await r.mkdir(e, t.mode);
        } catch (t) {
          if ("EPERM" === t.code) throw t;
          if ("ENOENT" === t.code) {
            if (i.dirname(e) === e) throw u(e);
            if (t.message.includes("null bytes")) throw t;
            return await n(i.dirname(e)), n(e);
          }
          try {
            if (!(await r.stat(e)).isDirectory())
              throw new Error("The path is not a directory");
          } catch {
            throw t;
          }
        }
      };
      return n(i.resolve(e));
    }),
      (e.exports.makeDirSync = (e, t) => {
        if ((o(e), (t = a(t)), s)) {
          const n = i.resolve(e);
          return r.mkdirSync(n, { mode: t.mode, recursive: !0 });
        }
        const n = (e) => {
          try {
            r.mkdirSync(e, t.mode);
          } catch (t) {
            if ("EPERM" === t.code) throw t;
            if ("ENOENT" === t.code) {
              if (i.dirname(e) === e) throw u(e);
              if (t.message.includes("null bytes")) throw t;
              return n(i.dirname(e)), n(e);
            }
            try {
              if (!r.statSync(e).isDirectory())
                throw new Error("The path is not a directory");
            } catch {
              throw t;
            }
          }
        };
        return n(i.resolve(e));
      });
  },
  "./node_modules/fs-extra/lib/move-sync/index.js": function (e, t, n) {
    "use strict";
    e.exports = {
      moveSync: n("./node_modules/fs-extra/lib/move-sync/move-sync.js"),
    };
  },
  "./node_modules/fs-extra/lib/move-sync/move-sync.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js"),
      i = n("path"),
      s = n("./node_modules/fs-extra/lib/copy-sync/index.js").copySync,
      o = n("./node_modules/fs-extra/lib/remove/index.js").removeSync,
      a = n("./node_modules/fs-extra/lib/mkdirs/index.js").mkdirpSync,
      u = n("./node_modules/fs-extra/lib/util/stat.js");
    function c(e, t, n) {
      try {
        r.renameSync(e, t);
      } catch (r) {
        if ("EXDEV" !== r.code) throw r;
        return (function (e, t, n) {
          return s(e, t, { overwrite: n, errorOnExist: true }), o(e);
        })(e, t, n);
      }
    }
    e.exports = function (e, t, n) {
      const s = (n = n || {}).overwrite || n.clobber || !1,
        { srcStat: l } = u.checkPathsSync(e, t, "move");
      return (
        u.checkParentPathsSync(e, l, t, "move"),
        a(i.dirname(t)),
        (function (e, t, n) {
          if (n) return o(t), c(e, t, n);
          if (r.existsSync(t)) throw new Error("dest already exists.");
          return c(e, t, n);
        })(e, t, s)
      );
    };
  },
  "./node_modules/fs-extra/lib/move/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
      .fromCallback;
    e.exports = { move: r(n("./node_modules/fs-extra/lib/move/move.js")) };
  },
  "./node_modules/fs-extra/lib/move/move.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js"),
      i = n("path"),
      s = n("./node_modules/fs-extra/lib/copy/index.js").copy,
      o = n("./node_modules/fs-extra/lib/remove/index.js").remove,
      a = n("./node_modules/fs-extra/lib/mkdirs/index.js").mkdirp,
      u = n("./node_modules/fs-extra/lib/path-exists/index.js").pathExists,
      c = n("./node_modules/fs-extra/lib/util/stat.js");
    function l(e, t, n, i) {
      r.rename(e, t, (r) =>
        r
          ? "EXDEV" !== r.code
            ? i(r)
            : (function (e, t, n, r) {
                s(e, t, { overwrite: n, errorOnExist: !0 }, (t) =>
                  t ? r(t) : o(e, r)
                );
              })(e, t, n, i)
          : i()
      );
    }
    e.exports = function (e, t, n, r) {
      "function" == typeof n && ((r = n), (n = {}));
      const s = n.overwrite || n.clobber || !1;
      c.checkPaths(e, t, "move", (n, h) => {
        if (n) return r(n);
        const { srcStat: d } = h;
        c.checkParentPaths(e, d, t, "move", (n) => {
          if (n) return r(n);
          a(i.dirname(t), (n) =>
            n
              ? r(n)
              : (function (e, t, n, r) {
                  if (n) return o(t, (i) => (i ? r(i) : l(e, t, n, r)));
                  u(t, (i, s) =>
                    i
                      ? r(i)
                      : s
                      ? r(new Error("dest already exists."))
                      : l(e, t, n, r)
                  );
                })(e, t, s, r)
          );
        });
      });
    };
  },
  "./node_modules/fs-extra/lib/output/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("./node_modules/graceful-fs/graceful-fs.js"),
      s = n("path"),
      o = n("./node_modules/fs-extra/lib/mkdirs/index.js"),
      a = n("./node_modules/fs-extra/lib/path-exists/index.js").pathExists;
    e.exports = {
      outputFile: r(function (e, t, n, r) {
        "function" == typeof n && ((r = n), (n = "utf8"));
        const u = s.dirname(e);
        a(u, (s, a) =>
          s
            ? r(s)
            : a
            ? i.writeFile(e, t, n, r)
            : void o.mkdirs(u, (s) => {
                if (s) return r(s);
                i.writeFile(e, t, n, r);
              })
        );
      }),
      outputFileSync: function (e, ...t) {
        const n = s.dirname(e);
        if (i.existsSync(n)) return i.writeFileSync(e, ...t);
        o.mkdirsSync(n), i.writeFileSync(e, ...t);
      },
    };
  },
  "./node_modules/fs-extra/lib/path-exists/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromPromise,
      i = n("./node_modules/fs-extra/lib/fs/index.js");
    e.exports = {
      pathExists: r(function (e) {
        return i
          .access(e)
          .then(() => !0)
          .catch(() => !1);
      }),
      pathExistsSync: i.existsSync,
    };
  },
  "./node_modules/fs-extra/lib/remove/index.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/node_modules/universalify/index.js")
        .fromCallback,
      i = n("./node_modules/fs-extra/lib/remove/rimraf.js");
    e.exports = { remove: r(i), removeSync: i.sync };
  },
  "./node_modules/fs-extra/lib/remove/rimraf.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js"),
      i = n("path"),
      s = n("assert"),
      o = "win32" === process.platform;
    function a(e) {
      ["unlink", "chmod", "stat", "lstat", "rmdir", "readdir"].forEach((t) => {
        (e[t] = e[t] || r[t]), (e[(t += "Sync")] = e[t] || r[t]);
      }),
        (e.maxBusyTries = e.maxBusyTries || 3);
    }
    function u(e, t, n) {
      let r = 0;
      "function" == typeof t && ((n = t), (t = {})),
        s(e, "rimraf: missing path"),
        s.strictEqual(typeof e, "string", "rimraf: path should be a string"),
        s.strictEqual(
          typeof n,
          "function",
          "rimraf: callback function required"
        ),
        s(t, "rimraf: invalid options argument provided"),
        s.strictEqual(typeof t, "object", "rimraf: options should be object"),
        a(t),
        c(e, t, function i(s) {
          if (s) {
            if (
              ("EBUSY" === s.code ||
                "ENOTEMPTY" === s.code ||
                "EPERM" === s.code) &&
              r < t.maxBusyTries
            ) {
              r++;
              return setTimeout(() => c(e, t, i), 100 * r);
            }
            "ENOENT" === s.code && (s = null);
          }
          n(s);
        });
    }
    function c(e, t, n) {
      s(e),
        s(t),
        s("function" == typeof n),
        t.lstat(e, (r, i) =>
          r && "ENOENT" === r.code
            ? n(null)
            : r && "EPERM" === r.code && o
            ? l(e, t, r, n)
            : i && i.isDirectory()
            ? d(e, t, r, n)
            : void t.unlink(e, (r) => {
                if (r) {
                  if ("ENOENT" === r.code) return n(null);
                  if ("EPERM" === r.code)
                    return o ? l(e, t, r, n) : d(e, t, r, n);
                  if ("EISDIR" === r.code) return d(e, t, r, n);
                }
                return n(r);
              })
        );
    }
    function l(e, t, n, r) {
      s(e),
        s(t),
        s("function" == typeof r),
        t.chmod(e, 438, (i) => {
          i
            ? r("ENOENT" === i.code ? null : n)
            : t.stat(e, (i, s) => {
                i
                  ? r("ENOENT" === i.code ? null : n)
                  : s.isDirectory()
                  ? d(e, t, n, r)
                  : t.unlink(e, r);
              });
        });
    }
    function h(e, t, n) {
      let r;
      s(e), s(t);
      try {
        t.chmodSync(e, 438);
      } catch (e) {
        if ("ENOENT" === e.code) return;
        throw n;
      }
      try {
        r = t.statSync(e);
      } catch (e) {
        if ("ENOENT" === e.code) return;
        throw n;
      }
      r.isDirectory() ? f(e, t, n) : t.unlinkSync(e);
    }
    function d(e, t, n, r) {
      s(e),
        s(t),
        s("function" == typeof r),
        t.rmdir(e, (o) => {
          !o ||
          ("ENOTEMPTY" !== o.code && "EEXIST" !== o.code && "EPERM" !== o.code)
            ? o && "ENOTDIR" === o.code
              ? r(n)
              : r(o)
            : (function (e, t, n) {
                s(e),
                  s(t),
                  s("function" == typeof n),
                  t.readdir(e, (r, s) => {
                    if (r) return n(r);
                    let o,
                      a = s.length;
                    if (0 === a) return t.rmdir(e, n);
                    s.forEach((r) => {
                      u(i.join(e, r), t, (r) => {
                        if (!o)
                          return r
                            ? n((o = r))
                            : void (0 == --a && t.rmdir(e, n));
                      });
                    });
                  });
              })(e, t, r);
        });
    }
    function p(e, t) {
      let n;
      a((t = t || {})),
        s(e, "rimraf: missing path"),
        s.strictEqual(typeof e, "string", "rimraf: path should be a string"),
        s(t, "rimraf: missing options"),
        s.strictEqual(typeof t, "object", "rimraf: options should be object");
      try {
        n = t.lstatSync(e);
      } catch (n) {
        if ("ENOENT" === n.code) return;
        "EPERM" === n.code && o && h(e, t, n);
      }
      try {
        n && n.isDirectory() ? f(e, t, null) : t.unlinkSync(e);
      } catch (n) {
        if ("ENOENT" === n.code) return;
        if ("EPERM" === n.code) return o ? h(e, t, n) : f(e, t, n);
        if ("EISDIR" !== n.code) throw n;
        f(e, t, n);
      }
    }
    function f(e, t, n) {
      s(e), s(t);
      try {
        t.rmdirSync(e);
      } catch (r) {
        if ("ENOTDIR" === r.code) throw n;
        if ("ENOTEMPTY" === r.code || "EEXIST" === r.code || "EPERM" === r.code)
          !(function (e, t) {
            if (
              (s(e),
              s(t),
              t.readdirSync(e).forEach((n) => p(i.join(e, n), t)),
              !o)
            ) {
              return t.rmdirSync(e, t);
            }
            {
              const n = Date.now();
              do {
                try {
                  return t.rmdirSync(e, t);
                } catch {}
              } while (Date.now() - n < 500);
            }
          })(e, t);
        else if ("ENOENT" !== r.code) throw r;
      }
    }
    (e.exports = u), (u.sync = p);
  },
  "./node_modules/fs-extra/lib/util/stat.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/fs-extra/lib/fs/index.js"),
      i = n("path"),
      s = n("util"),
      o = n("./node_modules/at-least-node/index.js")("10.5.0"),
      a = (e) => (o ? r.stat(e, { bigint: !0 }) : r.stat(e)),
      u = (e) => (o ? r.statSync(e, { bigint: !0 }) : r.statSync(e));
    function c(e, t) {
      return Promise.all([
        a(e),
        a(t).catch((e) => {
          if ("ENOENT" === e.code) return null;
          throw e;
        }),
      ]).then(([e, t]) => ({ srcStat: e, destStat: t }));
    }
    function l(e, t) {
      if (t.ino && t.dev && t.ino === e.ino && t.dev === e.dev) {
        if (o || t.ino < Number.MAX_SAFE_INTEGER) return !0;
        if (
          t.size === e.size &&
          t.mode === e.mode &&
          t.nlink === e.nlink &&
          t.atimeMs === e.atimeMs &&
          t.mtimeMs === e.mtimeMs &&
          t.ctimeMs === e.ctimeMs &&
          t.birthtimeMs === e.birthtimeMs
        )
          return !0;
      }
      return !1;
    }
    function h(e, t) {
      const n = i
          .resolve(e)
          .split(i.sep)
          .filter((e) => e),
        r = i
          .resolve(t)
          .split(i.sep)
          .filter((e) => e);
      return n.reduce((e, t, n) => e && r[n] === t, !0);
    }
    function d(e, t, n) {
      return `Cannot ${n} '${e}' to a subdirectory of itself, '${t}'.`;
    }
    e.exports = {
      checkPaths: function (e, t, n, r) {
        s.callbackify(c)(e, t, (i, s) => {
          if (i) return r(i);
          const { srcStat: o, destStat: a } = s;
          return a && l(o, a)
            ? r(new Error("Source and destination must not be the same."))
            : o.isDirectory() && h(e, t)
            ? r(new Error(d(e, t, n)))
            : r(null, { srcStat: o, destStat: a });
        });
      },
      checkPathsSync: function (e, t, n) {
        const { srcStat: r, destStat: i } = (function (e, t) {
          let n;
          const r = u(e);
          try {
            n = u(t);
          } catch (e) {
            if ("ENOENT" === e.code) return { srcStat: r, destStat: null };
            throw e;
          }
          return { srcStat: r, destStat: n };
        })(e, t);
        if (i && l(r, i))
          throw new Error("Source and destination must not be the same.");
        if (r.isDirectory() && h(e, t)) throw new Error(d(e, t, n));
        return { srcStat: r, destStat: i };
      },
      checkParentPaths: function e(t, n, s, a, u) {
        const c = i.resolve(i.dirname(t)),
          h = i.resolve(i.dirname(s));
        if (h === c || h === i.parse(h).root) return u();
        const p = (r, i) =>
          r
            ? "ENOENT" === r.code
              ? u()
              : u(r)
            : l(n, i)
            ? u(new Error(d(t, s, a)))
            : e(t, n, h, a, u);
        o ? r.stat(h, { bigint: !0 }, p) : r.stat(h, p);
      },
      checkParentPathsSync: function e(t, n, r, s) {
        const o = i.resolve(i.dirname(t)),
          a = i.resolve(i.dirname(r));
        if (a === o || a === i.parse(a).root) return;
        let c;
        try {
          c = u(a);
        } catch (e) {
          if ("ENOENT" === e.code) return;
          throw e;
        }
        if (l(n, c)) throw new Error(d(t, r, s));
        return e(t, n, a, s);
      },
      isSrcSubdir: h,
    };
  },
  "./node_modules/fs-extra/lib/util/utimes.js": function (e, t, n) {
    "use strict";
    const r = n("./node_modules/graceful-fs/graceful-fs.js");
    e.exports = {
      utimesMillis: function (e, t, n, i) {
        r.open(e, "r+", (e, s) => {
          if (e) return i(e);
          r.futimes(s, t, n, (e) => {
            r.close(s, (t) => {
              i && i(e || t);
            });
          });
        });
      },
      utimesMillisSync: function (e, t, n) {
        const i = r.openSync(e, "r+");
        return r.futimesSync(i, t, n), r.closeSync(i);
      },
    };
  },
  "./node_modules/fs-extra/node_modules/jsonfile/index.js": function (e, t, n) {
    let r;
    try {
      r = n("./node_modules/graceful-fs/graceful-fs.js");
    } catch (e) {
      r = n("fs");
    }
    const i = n("./node_modules/fs-extra/node_modules/universalify/index.js"),
      { stringify: s, stripBom: o } = n(
        "./node_modules/fs-extra/node_modules/jsonfile/utils.js"
      );
    const a = {
      readFile: i.fromPromise(async function (e, t = {}) {
        "string" == typeof t && (t = { encoding: t });
        const n = t.fs || r,
          s = !("throws" in t) || t.throws;
        let a,
          u = await i.fromCallback(n.readFile)(e, t);
        u = o(u);
        try {
          a = JSON.parse(u, t ? t.reviver : null);
        } catch (t) {
          if (s) throw ((t.message = `${e}: ${t.message}`), t);
          return null;
        }
        return a;
      }),
      readFileSync: function (e, t = {}) {
        "string" == typeof t && (t = { encoding: t });
        const n = t.fs || r,
          i = !("throws" in t) || t.throws;
        try {
          let r = n.readFileSync(e, t);
          return (r = o(r)), JSON.parse(r, t.reviver);
        } catch (t) {
          if (i) throw ((t.message = `${e}: ${t.message}`), t);
          return null;
        }
      },
      writeFile: i.fromPromise(async function (e, t, n = {}) {
        const o = n.fs || r,
          a = s(t, n);
        await i.fromCallback(o.writeFile)(e, a, n);
      }),
      writeFileSync: function (e, t, n = {}) {
        const i = n.fs || r,
          o = s(t, n);
        return i.writeFileSync(e, o, n);
      },
    };
    e.exports = a;
  },
  "./node_modules/fs-extra/node_modules/jsonfile/utils.js": function (e, t) {
    e.exports = {
      stringify: function (e, t = {}) {
        const n = t.EOL || "\n";
        return (
          JSON.stringify(e, t ? t.replacer : null, t.spaces).replace(/\n/g, n) +
          n
        );
      },
      stripBom: function (e) {
        return (
          Buffer.isBuffer(e) && (e = e.toString("utf8")),
          e.replace(/^\uFEFF/, "")
        );
      },
    };
  },
  "./node_modules/fs-extra/node_modules/universalify/index.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    (t.fromCallback = function (e) {
      return Object.defineProperty(
        function (...t) {
          if ("function" != typeof t[t.length - 1])
            return new Promise((n, r) => {
              e.apply(this, t.concat([(e, t) => (e ? r(e) : n(t))]));
            });
          e.apply(this, t);
        },
        "name",
        { value: e.name }
      );
    }),
      (t.fromPromise = function (e) {
        return Object.defineProperty(
          function (...t) {
            const n = t[t.length - 1];
            if ("function" != typeof n) return e.apply(this, t);
            e.apply(this, t.slice(0, -1)).then((e) => n(null, e), n);
          },
          "name",
          { value: e.name }
        );
      });
  },
  "./node_modules/fs.realpath/index.js": function (e, t, n) {
    (e.exports = l),
      (l.realpath = l),
      (l.sync = h),
      (l.realpathSync = h),
      (l.monkeypatch = function () {
        (r.realpath = l), (r.realpathSync = h);
      }),
      (l.unmonkeypatch = function () {
        (r.realpath = i), (r.realpathSync = s);
      });
    var r = n("fs"),
      i = r.realpath,
      s = r.realpathSync,
      o = process.version,
      a = /^v[0-5]\./.test(o),
      u = n("./node_modules/fs.realpath/old.js");
    function c(e) {
      return (
        e &&
        "realpath" === e.syscall &&
        ("ELOOP" === e.code || "ENOMEM" === e.code || "ENAMETOOLONG" === e.code)
      );
    }
    function l(e, t, n) {
      if (a) return i(e, t, n);
      "function" == typeof t && ((n = t), (t = null)),
        i(e, t, function (r, i) {
          c(r) ? u.realpath(e, t, n) : n(r, i);
        });
    }
    function h(e, t) {
      if (a) return s(e, t);
      try {
        return s(e, t);
      } catch (n) {
        if (c(n)) return u.realpathSync(e, t);
        throw n;
      }
    }
  },
  "./node_modules/fs.realpath/old.js": function (e, t, n) {
    var r = n("path"),
      i = "win32" === process.platform,
      s = n("fs"),
      o = process.env.NODE_DEBUG && /fs/.test(process.env.NODE_DEBUG);
    function a(e) {
      return "function" == typeof e
        ? e
        : (function () {
            var e;
            if (o) {
              var t = new Error();
              e = function (e) {
                e && ((t.message = e.message), n((e = t)));
              };
            } else e = n;
            return e;
            function n(e) {
              if (e) {
                if (process.throwDeprecation) throw e;
                if (!process.noDeprecation) {
                  var t = "fs: missing callback " + (e.stack || e.message);
                  process.traceDeprecation
                    ? console.trace(t)
                    : console.error(t);
                }
              }
            }
          })();
    }
    r.normalize;
    if (i) var u = /(.*?)(?:[\/\\]+|$)/g;
    else u = /(.*?)(?:[\/]+|$)/g;
    if (i) var c = /^(?:[a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/][^\\\/]+)?[\\\/]*/;
    else c = /^[\/]*/;
    (t.realpathSync = function (e, t) {
      if (((e = r.resolve(e)), t && Object.prototype.hasOwnProperty.call(t, e)))
        return t[e];
      var n,
        o,
        a,
        l,
        h = e,
        d = {},
        p = {};
      function f() {
        var t = c.exec(e);
        (n = t[0].length),
          (o = t[0]),
          (a = t[0]),
          (l = ""),
          i && !p[a] && (s.lstatSync(a), (p[a] = !0));
      }
      for (f(); n < e.length; ) {
        u.lastIndex = n;
        var m = u.exec(e);
        if (
          ((l = o),
          (o += m[0]),
          (a = l + m[1]),
          (n = u.lastIndex),
          !(p[a] || (t && t[a] === a)))
        ) {
          var g;
          if (t && Object.prototype.hasOwnProperty.call(t, a)) g = t[a];
          else {
            var y = s.lstatSync(a);
            if (!y.isSymbolicLink()) {
              (p[a] = !0), t && (t[a] = a);
              continue;
            }
            var v = null;
            if (!i) {
              var E = y.dev.toString(32) + ":" + y.ino.toString(32);
              d.hasOwnProperty(E) && (v = d[E]);
            }
            null === v && (s.statSync(a), (v = s.readlinkSync(a))),
              (g = r.resolve(l, v)),
              t && (t[a] = g),
              i || (d[E] = v);
          }
          (e = r.resolve(g, e.slice(n))), f();
        }
      }
      return t && (t[h] = e), e;
    }),
      (t.realpath = function (e, t, n) {
        if (
          ("function" != typeof n && ((n = a(t)), (t = null)),
          (e = r.resolve(e)),
          t && Object.prototype.hasOwnProperty.call(t, e))
        )
          return process.nextTick(n.bind(null, null, t[e]));
        var o,
          l,
          h,
          d,
          p = e,
          f = {},
          m = {};
        function g() {
          var t = c.exec(e);
          (o = t[0].length),
            (l = t[0]),
            (h = t[0]),
            (d = ""),
            i && !m[h]
              ? s.lstat(h, function (e) {
                  if (e) return n(e);
                  (m[h] = !0), y();
                })
              : process.nextTick(y);
        }
        function y() {
          if (o >= e.length) return t && (t[p] = e), n(null, e);
          u.lastIndex = o;
          var r = u.exec(e);
          return (
            (d = l),
            (l += r[0]),
            (h = d + r[1]),
            (o = u.lastIndex),
            m[h] || (t && t[h] === h)
              ? process.nextTick(y)
              : t && Object.prototype.hasOwnProperty.call(t, h)
              ? x(t[h])
              : s.lstat(h, v)
          );
        }
        function v(e, r) {
          if (e) return n(e);
          if (!r.isSymbolicLink())
            return (m[h] = !0), t && (t[h] = h), process.nextTick(y);
          if (!i) {
            var o = r.dev.toString(32) + ":" + r.ino.toString(32);
            if (f.hasOwnProperty(o)) return E(null, f[o], h);
          }
          s.stat(h, function (e) {
            if (e) return n(e);
            s.readlink(h, function (e, t) {
              i || (f[o] = t), E(e, t);
            });
          });
        }
        function E(e, i, s) {
          if (e) return n(e);
          var o = r.resolve(d, i);
          t && (t[s] = o), x(o);
        }
        function x(t) {
          (e = r.resolve(t, e.slice(o))), g();
        }
        g();
      });
  },
  "./node_modules/glob/common.js": function (e, t, n) {
    function r(e, t) {
      return Object.prototype.hasOwnProperty.call(e, t);
    }
    (t.alphasort = c),
      (t.alphasorti = u),
      (t.setopts = function (e, t, n) {
        n || (n = {});
        if (n.matchBase && -1 === t.indexOf("/")) {
          if (n.noglobstar) throw new Error("base matching requires globstar");
          t = "**/" + t;
        }
        (e.silent = !!n.silent),
          (e.pattern = t),
          (e.strict = !1 !== n.strict),
          (e.realpath = !!n.realpath),
          (e.realpathCache = n.realpathCache || Object.create(null)),
          (e.follow = !!n.follow),
          (e.dot = !!n.dot),
          (e.mark = !!n.mark),
          (e.nodir = !!n.nodir),
          e.nodir && (e.mark = !0);
        (e.sync = !!n.sync),
          (e.nounique = !!n.nounique),
          (e.nonull = !!n.nonull),
          (e.nosort = !!n.nosort),
          (e.nocase = !!n.nocase),
          (e.stat = !!n.stat),
          (e.noprocess = !!n.noprocess),
          (e.absolute = !!n.absolute),
          (e.maxLength = n.maxLength || 1 / 0),
          (e.cache = n.cache || Object.create(null)),
          (e.statCache = n.statCache || Object.create(null)),
          (e.symlinks = n.symlinks || Object.create(null)),
          (function (e, t) {
            (e.ignore = t.ignore || []),
              Array.isArray(e.ignore) || (e.ignore = [e.ignore]);
            e.ignore.length && (e.ignore = e.ignore.map(l));
          })(e, n),
          (e.changedCwd = !1);
        var s = process.cwd();
        r(n, "cwd")
          ? ((e.cwd = i.resolve(n.cwd)), (e.changedCwd = e.cwd !== s))
          : (e.cwd = s);
        (e.root = n.root || i.resolve(e.cwd, "/")),
          (e.root = i.resolve(e.root)),
          "win32" === process.platform && (e.root = e.root.replace(/\\/g, "/"));
        (e.cwdAbs = o(e.cwd) ? e.cwd : h(e, e.cwd)),
          "win32" === process.platform &&
            (e.cwdAbs = e.cwdAbs.replace(/\\/g, "/"));
        (e.nomount = !!n.nomount),
          (n.nonegate = !0),
          (n.nocomment = !0),
          (e.minimatch = new a(t, n)),
          (e.options = e.minimatch.options);
      }),
      (t.ownProp = r),
      (t.makeAbs = h),
      (t.finish = function (e) {
        for (
          var t = e.nounique,
            n = t ? [] : Object.create(null),
            r = 0,
            i = e.matches.length;
          r < i;
          r++
        ) {
          var s = e.matches[r];
          if (s && 0 !== Object.keys(s).length) {
            var o = Object.keys(s);
            t
              ? n.push.apply(n, o)
              : o.forEach(function (e) {
                  n[e] = !0;
                });
          } else if (e.nonull) {
            var a = e.minimatch.globSet[r];
            t ? n.push(a) : (n[a] = !0);
          }
        }
        t || (n = Object.keys(n));
        e.nosort || (n = n.sort(e.nocase ? u : c));
        if (e.mark) {
          for (r = 0; r < n.length; r++) n[r] = e._mark(n[r]);
          e.nodir &&
            (n = n.filter(function (t) {
              var n = !/\/$/.test(t),
                r = e.cache[t] || e.cache[h(e, t)];
              return n && r && (n = "DIR" !== r && !Array.isArray(r)), n;
            }));
        }
        e.ignore.length &&
          (n = n.filter(function (t) {
            return !d(e, t);
          }));
        e.found = n;
      }),
      (t.mark = function (e, t) {
        var n = h(e, t),
          r = e.cache[n],
          i = t;
        if (r) {
          var s = "DIR" === r || Array.isArray(r),
            o = "/" === t.slice(-1);
          if (
            (s && !o ? (i += "/") : !s && o && (i = i.slice(0, -1)), i !== t)
          ) {
            var a = h(e, i);
            (e.statCache[a] = e.statCache[n]), (e.cache[a] = e.cache[n]);
          }
        }
        return i;
      }),
      (t.isIgnored = d),
      (t.childrenIgnored = function (e, t) {
        return (
          !!e.ignore.length &&
          e.ignore.some(function (e) {
            return !(!e.gmatcher || !e.gmatcher.match(t));
          })
        );
      });
    var i = n("path"),
      s = n("./node_modules/minimatch/minimatch.js"),
      o = n("./node_modules/path-is-absolute/index.js"),
      a = s.Minimatch;
    function u(e, t) {
      return e.toLowerCase().localeCompare(t.toLowerCase());
    }
    function c(e, t) {
      return e.localeCompare(t);
    }
    function l(e) {
      var t = null;
      if ("/**" === e.slice(-3)) {
        var n = e.replace(/(\/\*\*)+$/, "");
        t = new a(n, { dot: !0 });
      }
      return { matcher: new a(e, { dot: !0 }), gmatcher: t };
    }
    function h(e, t) {
      var n = t;
      return (
        (n =
          "/" === t.charAt(0)
            ? i.join(e.root, t)
            : o(t) || "" === t
            ? t
            : e.changedCwd
            ? i.resolve(e.cwd, t)
            : i.resolve(t)),
        "win32" === process.platform && (n = n.replace(/\\/g, "/")),
        n
      );
    }
    function d(e, t) {
      return (
        !!e.ignore.length &&
        e.ignore.some(function (e) {
          return e.matcher.match(t) || !(!e.gmatcher || !e.gmatcher.match(t));
        })
      );
    }
  },
  "./node_modules/glob/glob.js": function (e, t, n) {
    e.exports = E;
    var r = n("fs"),
      i = n("./node_modules/fs.realpath/index.js"),
      s = n("./node_modules/minimatch/minimatch.js"),
      o = (s.Minimatch, n("./node_modules/inherits/inherits.js")),
      a = n("events").EventEmitter,
      u = n("path"),
      c = n("assert"),
      l = n("./node_modules/path-is-absolute/index.js"),
      h = n("./node_modules/glob/sync.js"),
      d = n("./node_modules/glob/common.js"),
      p = (d.alphasort, d.alphasorti, d.setopts),
      f = d.ownProp,
      m = n("./node_modules/inflight/inflight.js"),
      g = (n("util"), d.childrenIgnored),
      y = d.isIgnored,
      v = n("./node_modules/once/once.js");
    function E(e, t, n) {
      if (
        ("function" == typeof t && ((n = t), (t = {})), t || (t = {}), t.sync)
      ) {
        if (n) throw new TypeError("callback provided to sync glob");
        return h(e, t);
      }
      return new b(e, t, n);
    }
    E.sync = h;
    var x = (E.GlobSync = h.GlobSync);
    function b(e, t, n) {
      if (("function" == typeof t && ((n = t), (t = null)), t && t.sync)) {
        if (n) throw new TypeError("callback provided to sync glob");
        return new x(e, t);
      }
      if (!(this instanceof b)) return new b(e, t, n);
      p(this, e, t), (this._didRealPath = !1);
      var r = this.minimatch.set.length;
      (this.matches = new Array(r)),
        "function" == typeof n &&
          ((n = v(n)),
          this.on("error", n),
          this.on("end", function (e) {
            n(null, e);
          }));
      var i = this;
      if (
        ((this._processing = 0),
        (this._emitQueue = []),
        (this._processQueue = []),
        (this.paused = !1),
        this.noprocess)
      )
        return this;
      if (0 === r) return o();
      for (var s = 0; s < r; s++)
        this._process(this.minimatch.set[s], s, !1, o);
      function o() {
        --i._processing, i._processing <= 0 && i._finish();
      }
    }
    (E.glob = E),
      (E.hasMagic = function (e, t) {
        var n = (function (e, t) {
          if (null === t || "object" != typeof t) return e;
          for (var n = Object.keys(t), r = n.length; r--; ) e[n[r]] = t[n[r]];
          return e;
        })({}, t);
        n.noprocess = !0;
        var r = new b(e, n).minimatch.set;
        if (!e) return !1;
        if (r.length > 1) return !0;
        for (var i = 0; i < r[0].length; i++)
          if ("string" != typeof r[0][i]) return !0;
        return !1;
      }),
      (E.Glob = b),
      o(b, a),
      (b.prototype._finish = function () {
        if ((c(this instanceof b), !this.aborted)) {
          if (this.realpath && !this._didRealpath) return this._realpath();
          d.finish(this), this.emit("end", this.found);
        }
      }),
      (b.prototype._realpath = function () {
        if (!this._didRealpath) {
          this._didRealpath = !0;
          var e = this.matches.length;
          if (0 === e) return this._finish();
          for (var t = this, n = 0; n < this.matches.length; n++)
            this._realpathSet(n, r);
        }
        function r() {
          0 == --e && t._finish();
        }
      }),
      (b.prototype._realpathSet = function (e, t) {
        var n = this.matches[e];
        if (!n) return t();
        var r = Object.keys(n),
          s = this,
          o = r.length;
        if (0 === o) return t();
        var a = (this.matches[e] = Object.create(null));
        r.forEach(function (n, r) {
          (n = s._makeAbs(n)),
            i.realpath(n, s.realpathCache, function (r, i) {
              r
                ? "stat" === r.syscall
                  ? (a[n] = !0)
                  : s.emit("error", r)
                : (a[i] = !0),
                0 == --o && ((s.matches[e] = a), t());
            });
        });
      }),
      (b.prototype._mark = function (e) {
        return d.mark(this, e);
      }),
      (b.prototype._makeAbs = function (e) {
        return d.makeAbs(this, e);
      }),
      (b.prototype.abort = function () {
        (this.aborted = !0), this.emit("abort");
      }),
      (b.prototype.pause = function () {
        this.paused || ((this.paused = !0), this.emit("pause"));
      }),
      (b.prototype.resume = function () {
        if (this.paused) {
          if (
            (this.emit("resume"), (this.paused = !1), this._emitQueue.length)
          ) {
            var e = this._emitQueue.slice(0);
            this._emitQueue.length = 0;
            for (var t = 0; t < e.length; t++) {
              var n = e[t];
              this._emitMatch(n[0], n[1]);
            }
          }
          if (this._processQueue.length) {
            var r = this._processQueue.slice(0);
            this._processQueue.length = 0;
            for (t = 0; t < r.length; t++) {
              var i = r[t];
              this._processing--, this._process(i[0], i[1], i[2], i[3]);
            }
          }
        }
      }),
      (b.prototype._process = function (e, t, n, r) {
        if ((c(this instanceof b), c("function" == typeof r), !this.aborted))
          if ((this._processing++, this.paused))
            this._processQueue.push([e, t, n, r]);
          else {
            for (var i, o = 0; "string" == typeof e[o]; ) o++;
            switch (o) {
              case e.length:
                return void this._processSimple(e.join("/"), t, r);
              case 0:
                i = null;
                break;
              default:
                i = e.slice(0, o).join("/");
            }
            var a,
              u = e.slice(o);
            null === i
              ? (a = ".")
              : l(i) || l(e.join("/"))
              ? ((i && l(i)) || (i = "/" + i), (a = i))
              : (a = i);
            var h = this._makeAbs(a);
            if (g(this, a)) return r();
            u[0] === s.GLOBSTAR
              ? this._processGlobStar(i, a, h, u, t, n, r)
              : this._processReaddir(i, a, h, u, t, n, r);
          }
      }),
      (b.prototype._processReaddir = function (e, t, n, r, i, s, o) {
        var a = this;
        this._readdir(n, s, function (u, c) {
          return a._processReaddir2(e, t, n, r, i, s, c, o);
        });
      }),
      (b.prototype._processReaddir2 = function (e, t, n, r, i, s, o, a) {
        if (!o) return a();
        for (
          var c = r[0],
            l = !!this.minimatch.negate,
            h = c._glob,
            d = this.dot || "." === h.charAt(0),
            p = [],
            f = 0;
          f < o.length;
          f++
        ) {
          if ("." !== (g = o[f]).charAt(0) || d)
            (l && !e ? !g.match(c) : g.match(c)) && p.push(g);
        }
        var m = p.length;
        if (0 === m) return a();
        if (1 === r.length && !this.mark && !this.stat) {
          this.matches[i] || (this.matches[i] = Object.create(null));
          for (f = 0; f < m; f++) {
            var g = p[f];
            e && (g = "/" !== e ? e + "/" + g : e + g),
              "/" !== g.charAt(0) || this.nomount || (g = u.join(this.root, g)),
              this._emitMatch(i, g);
          }
          return a();
        }
        r.shift();
        for (f = 0; f < m; f++) {
          g = p[f];
          e && (g = "/" !== e ? e + "/" + g : e + g),
            this._process([g].concat(r), i, s, a);
        }
        a();
      }),
      (b.prototype._emitMatch = function (e, t) {
        if (!this.aborted && !y(this, t))
          if (this.paused) this._emitQueue.push([e, t]);
          else {
            var n = l(t) ? t : this._makeAbs(t);
            if (
              (this.mark && (t = this._mark(t)),
              this.absolute && (t = n),
              !this.matches[e][t])
            ) {
              if (this.nodir) {
                var r = this.cache[n];
                if ("DIR" === r || Array.isArray(r)) return;
              }
              this.matches[e][t] = !0;
              var i = this.statCache[n];
              i && this.emit("stat", t, i), this.emit("match", t);
            }
          }
      }),
      (b.prototype._readdirInGlobStar = function (e, t) {
        if (!this.aborted) {
          if (this.follow) return this._readdir(e, !1, t);
          var n = this,
            i = m("lstat\0" + e, function (r, i) {
              if (r && "ENOENT" === r.code) return t();
              var s = i && i.isSymbolicLink();
              (n.symlinks[e] = s),
                s || !i || i.isDirectory()
                  ? n._readdir(e, !1, t)
                  : ((n.cache[e] = "FILE"), t());
            });
          i && r.lstat(e, i);
        }
      }),
      (b.prototype._readdir = function (e, t, n) {
        if (!this.aborted && (n = m("readdir\0" + e + "\0" + t, n))) {
          if (t && !f(this.symlinks, e)) return this._readdirInGlobStar(e, n);
          if (f(this.cache, e)) {
            var i = this.cache[e];
            if (!i || "FILE" === i) return n();
            if (Array.isArray(i)) return n(null, i);
          }
          r.readdir(
            e,
            (function (e, t, n) {
              return function (r, i) {
                r ? e._readdirError(t, r, n) : e._readdirEntries(t, i, n);
              };
            })(this, e, n)
          );
        }
      }),
      (b.prototype._readdirEntries = function (e, t, n) {
        if (!this.aborted) {
          if (!this.mark && !this.stat)
            for (var r = 0; r < t.length; r++) {
              var i = t[r];
              (i = "/" === e ? e + i : e + "/" + i), (this.cache[i] = !0);
            }
          return (this.cache[e] = t), n(null, t);
        }
      }),
      (b.prototype._readdirError = function (e, t, n) {
        if (!this.aborted) {
          switch (t.code) {
            case "ENOTSUP":
            case "ENOTDIR":
              var r = this._makeAbs(e);
              if (((this.cache[r] = "FILE"), r === this.cwdAbs)) {
                var i = new Error(t.code + " invalid cwd " + this.cwd);
                (i.path = this.cwd),
                  (i.code = t.code),
                  this.emit("error", i),
                  this.abort();
              }
              break;
            case "ENOENT":
            case "ELOOP":
            case "ENAMETOOLONG":
            case "UNKNOWN":
              this.cache[this._makeAbs(e)] = !1;
              break;
            default:
              (this.cache[this._makeAbs(e)] = !1),
                this.strict && (this.emit("error", t), this.abort()),
                this.silent || console.error("glob error", t);
          }
          return n();
        }
      }),
      (b.prototype._processGlobStar = function (e, t, n, r, i, s, o) {
        var a = this;
        this._readdir(n, s, function (u, c) {
          a._processGlobStar2(e, t, n, r, i, s, c, o);
        });
      }),
      (b.prototype._processGlobStar2 = function (e, t, n, r, i, s, o, a) {
        if (!o) return a();
        var u = r.slice(1),
          c = e ? [e] : [],
          l = c.concat(u);
        this._process(l, i, !1, a);
        var h = this.symlinks[n],
          d = o.length;
        if (h && s) return a();
        for (var p = 0; p < d; p++) {
          if ("." !== o[p].charAt(0) || this.dot) {
            var f = c.concat(o[p], u);
            this._process(f, i, !0, a);
            var m = c.concat(o[p], r);
            this._process(m, i, !0, a);
          }
        }
        a();
      }),
      (b.prototype._processSimple = function (e, t, n) {
        var r = this;
        this._stat(e, function (i, s) {
          r._processSimple2(e, t, i, s, n);
        });
      }),
      (b.prototype._processSimple2 = function (e, t, n, r, i) {
        if ((this.matches[t] || (this.matches[t] = Object.create(null)), !r))
          return i();
        if (e && l(e) && !this.nomount) {
          var s = /[\/\\]$/.test(e);
          "/" === e.charAt(0)
            ? (e = u.join(this.root, e))
            : ((e = u.resolve(this.root, e)), s && (e += "/"));
        }
        "win32" === process.platform && (e = e.replace(/\\/g, "/")),
          this._emitMatch(t, e),
          i();
      }),
      (b.prototype._stat = function (e, t) {
        var n = this._makeAbs(e),
          i = "/" === e.slice(-1);
        if (e.length > this.maxLength) return t();
        if (!this.stat && f(this.cache, n)) {
          var s = this.cache[n];
          if ((Array.isArray(s) && (s = "DIR"), !i || "DIR" === s))
            return t(null, s);
          if (i && "FILE" === s) return t();
        }
        var o = this.statCache[n];
        if (void 0 !== o) {
          if (!1 === o) return t(null, o);
          var a = o.isDirectory() ? "DIR" : "FILE";
          return i && "FILE" === a ? t() : t(null, a, o);
        }
        var u = this,
          c = m("stat\0" + n, function (i, s) {
            if (s && s.isSymbolicLink())
              return r.stat(n, function (r, i) {
                r ? u._stat2(e, n, null, s, t) : u._stat2(e, n, r, i, t);
              });
            u._stat2(e, n, i, s, t);
          });
        c && r.lstat(n, c);
      }),
      (b.prototype._stat2 = function (e, t, n, r, i) {
        if (n && ("ENOENT" === n.code || "ENOTDIR" === n.code))
          return (this.statCache[t] = !1), i();
        var s = "/" === e.slice(-1);
        if (
          ((this.statCache[t] = r),
          "/" === t.slice(-1) && r && !r.isDirectory())
        )
          return i(null, !1, r);
        var o = !0;
        return (
          r && (o = r.isDirectory() ? "DIR" : "FILE"),
          (this.cache[t] = this.cache[t] || o),
          s && "FILE" === o ? i() : i(null, o, r)
        );
      });
  },
  "./node_modules/glob/sync.js": function (e, t, n) {
    (e.exports = f), (f.GlobSync = m);
    var r = n("fs"),
      i = n("./node_modules/fs.realpath/index.js"),
      s = n("./node_modules/minimatch/minimatch.js"),
      o =
        (s.Minimatch,
        n("./node_modules/glob/glob.js").Glob,
        n("util"),
        n("path")),
      a = n("assert"),
      u = n("./node_modules/path-is-absolute/index.js"),
      c = n("./node_modules/glob/common.js"),
      l = (c.alphasort, c.alphasorti, c.setopts),
      h = c.ownProp,
      d = c.childrenIgnored,
      p = c.isIgnored;
    function f(e, t) {
      if ("function" == typeof t || 3 === arguments.length)
        throw new TypeError(
          "callback provided to sync glob\nSee: https://github.com/isaacs/node-glob/issues/167"
        );
      return new m(e, t).found;
    }
    function m(e, t) {
      if (!e) throw new Error("must provide pattern");
      if ("function" == typeof t || 3 === arguments.length)
        throw new TypeError(
          "callback provided to sync glob\nSee: https://github.com/isaacs/node-glob/issues/167"
        );
      if (!(this instanceof m)) return new m(e, t);
      if ((l(this, e, t), this.noprocess)) return this;
      var n = this.minimatch.set.length;
      this.matches = new Array(n);
      for (var r = 0; r < n; r++) this._process(this.minimatch.set[r], r, !1);
      this._finish();
    }
    (m.prototype._finish = function () {
      if ((a(this instanceof m), this.realpath)) {
        var e = this;
        this.matches.forEach(function (t, n) {
          var r = (e.matches[n] = Object.create(null));
          for (var s in t)
            try {
              (s = e._makeAbs(s)), (r[i.realpathSync(s, e.realpathCache)] = !0);
            } catch (t) {
              if ("stat" !== t.syscall) throw t;
              r[e._makeAbs(s)] = !0;
            }
        });
      }
      c.finish(this);
    }),
      (m.prototype._process = function (e, t, n) {
        a(this instanceof m);
        for (var r, i = 0; "string" == typeof e[i]; ) i++;
        switch (i) {
          case e.length:
            return void this._processSimple(e.join("/"), t);
          case 0:
            r = null;
            break;
          default:
            r = e.slice(0, i).join("/");
        }
        var o,
          c = e.slice(i);
        null === r
          ? (o = ".")
          : u(r) || u(e.join("/"))
          ? ((r && u(r)) || (r = "/" + r), (o = r))
          : (o = r);
        var l = this._makeAbs(o);
        d(this, o) ||
          (c[0] === s.GLOBSTAR
            ? this._processGlobStar(r, o, l, c, t, n)
            : this._processReaddir(r, o, l, c, t, n));
      }),
      (m.prototype._processReaddir = function (e, t, n, r, i, s) {
        var a = this._readdir(n, s);
        if (a) {
          for (
            var u = r[0],
              c = !!this.minimatch.negate,
              l = u._glob,
              h = this.dot || "." === l.charAt(0),
              d = [],
              p = 0;
            p < a.length;
            p++
          ) {
            if ("." !== (g = a[p]).charAt(0) || h)
              (c && !e ? !g.match(u) : g.match(u)) && d.push(g);
          }
          var f = d.length;
          if (0 !== f)
            if (1 !== r.length || this.mark || this.stat) {
              r.shift();
              for (p = 0; p < f; p++) {
                var m;
                g = d[p];
                (m = e ? [e, g] : [g]), this._process(m.concat(r), i, s);
              }
            } else {
              this.matches[i] || (this.matches[i] = Object.create(null));
              for (var p = 0; p < f; p++) {
                var g = d[p];
                e && (g = "/" !== e.slice(-1) ? e + "/" + g : e + g),
                  "/" !== g.charAt(0) ||
                    this.nomount ||
                    (g = o.join(this.root, g)),
                  this._emitMatch(i, g);
              }
            }
        }
      }),
      (m.prototype._emitMatch = function (e, t) {
        if (!p(this, t)) {
          var n = this._makeAbs(t);
          if (
            (this.mark && (t = this._mark(t)),
            this.absolute && (t = n),
            !this.matches[e][t])
          ) {
            if (this.nodir) {
              var r = this.cache[n];
              if ("DIR" === r || Array.isArray(r)) return;
            }
            (this.matches[e][t] = !0), this.stat && this._stat(t);
          }
        }
      }),
      (m.prototype._readdirInGlobStar = function (e) {
        if (this.follow) return this._readdir(e, !1);
        var t, n;
        try {
          n = r.lstatSync(e);
        } catch (e) {
          if ("ENOENT" === e.code) return null;
        }
        var i = n && n.isSymbolicLink();
        return (
          (this.symlinks[e] = i),
          i || !n || n.isDirectory()
            ? (t = this._readdir(e, !1))
            : (this.cache[e] = "FILE"),
          t
        );
      }),
      (m.prototype._readdir = function (e, t) {
        if (t && !h(this.symlinks, e)) return this._readdirInGlobStar(e);
        if (h(this.cache, e)) {
          var n = this.cache[e];
          if (!n || "FILE" === n) return null;
          if (Array.isArray(n)) return n;
        }
        try {
          return this._readdirEntries(e, r.readdirSync(e));
        } catch (t) {
          return this._readdirError(e, t), null;
        }
      }),
      (m.prototype._readdirEntries = function (e, t) {
        if (!this.mark && !this.stat)
          for (var n = 0; n < t.length; n++) {
            var r = t[n];
            (r = "/" === e ? e + r : e + "/" + r), (this.cache[r] = !0);
          }
        return (this.cache[e] = t), t;
      }),
      (m.prototype._readdirError = function (e, t) {
        switch (t.code) {
          case "ENOTSUP":
          case "ENOTDIR":
            var n = this._makeAbs(e);
            if (((this.cache[n] = "FILE"), n === this.cwdAbs)) {
              var r = new Error(t.code + " invalid cwd " + this.cwd);
              throw ((r.path = this.cwd), (r.code = t.code), r);
            }
            break;
          case "ENOENT":
          case "ELOOP":
          case "ENAMETOOLONG":
          case "UNKNOWN":
            this.cache[this._makeAbs(e)] = !1;
            break;
          default:
            if (((this.cache[this._makeAbs(e)] = !1), this.strict)) throw t;
            this.silent || console.error("glob error", t);
        }
      }),
      (m.prototype._processGlobStar = function (e, t, n, r, i, s) {
        var o = this._readdir(n, s);
        if (o) {
          var a = r.slice(1),
            u = e ? [e] : [],
            c = u.concat(a);
          this._process(c, i, !1);
          var l = o.length;
          if (!this.symlinks[n] || !s)
            for (var h = 0; h < l; h++) {
              if ("." !== o[h].charAt(0) || this.dot) {
                var d = u.concat(o[h], a);
                this._process(d, i, !0);
                var p = u.concat(o[h], r);
                this._process(p, i, !0);
              }
            }
        }
      }),
      (m.prototype._processSimple = function (e, t) {
        var n = this._stat(e);
        if ((this.matches[t] || (this.matches[t] = Object.create(null)), n)) {
          if (e && u(e) && !this.nomount) {
            var r = /[\/\\]$/.test(e);
            "/" === e.charAt(0)
              ? (e = o.join(this.root, e))
              : ((e = o.resolve(this.root, e)), r && (e += "/"));
          }
          "win32" === process.platform && (e = e.replace(/\\/g, "/")),
            this._emitMatch(t, e);
        }
      }),
      (m.prototype._stat = function (e) {
        var t = this._makeAbs(e),
          n = "/" === e.slice(-1);
        if (e.length > this.maxLength) return !1;
        if (!this.stat && h(this.cache, t)) {
          var i = this.cache[t];
          if ((Array.isArray(i) && (i = "DIR"), !n || "DIR" === i)) return i;
          if (n && "FILE" === i) return !1;
        }
        var s = this.statCache[t];
        if (!s) {
          var o;
          try {
            o = r.lstatSync(t);
          } catch (e) {
            if (e && ("ENOENT" === e.code || "ENOTDIR" === e.code))
              return (this.statCache[t] = !1), !1;
          }
          if (o && o.isSymbolicLink())
            try {
              s = r.statSync(t);
            } catch (e) {
              s = o;
            }
          else s = o;
        }
        this.statCache[t] = s;
        i = !0;
        return (
          s && (i = s.isDirectory() ? "DIR" : "FILE"),
          (this.cache[t] = this.cache[t] || i),
          (!n || "FILE" !== i) && i
        );
      }),
      (m.prototype._mark = function (e) {
        return c.mark(this, e);
      }),
      (m.prototype._makeAbs = function (e) {
        return c.makeAbs(this, e);
      });
  },
  "./node_modules/graceful-fs/clone.js": function (e, t, n) {
    "use strict";
    e.exports = function (e) {
      if (null === e || "object" != typeof e) return e;
      if (e instanceof Object) var t = { __proto__: e.__proto__ };
      else t = Object.create(null);
      return (
        Object.getOwnPropertyNames(e).forEach(function (n) {
          Object.defineProperty(t, n, Object.getOwnPropertyDescriptor(e, n));
        }),
        t
      );
    };
  },
  "./node_modules/graceful-fs/graceful-fs.js": function (e, t, n) {
    var r,
      i,
      s = n("fs"),
      o = n("./node_modules/graceful-fs/polyfills.js"),
      a = n("./node_modules/graceful-fs/legacy-streams.js"),
      u = n("./node_modules/graceful-fs/clone.js"),
      c = n("util");
    function l(e, t) {
      Object.defineProperty(e, r, {
        get: function () {
          return t;
        },
      });
    }
    "function" == typeof Symbol && "function" == typeof Symbol.for
      ? ((r = Symbol.for("graceful-fs.queue")),
        (i = Symbol.for("graceful-fs.previous")))
      : ((r = "___graceful-fs.queue"), (i = "___graceful-fs.previous"));
    var h = function () {};
    if (
      (c.debuglog
        ? (h = c.debuglog("gfs4"))
        : /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") &&
          (h = function () {
            var e = c.format.apply(c, arguments);
            (e = "GFS4: " + e.split(/\n/).join("\nGFS4: ")), console.error(e);
          }),
      !s[r])
    ) {
      var d = global[r] || [];
      l(s, d),
        (s.close = (function (e) {
          function t(t, n) {
            return e.call(s, t, function (e) {
              e || m(), "function" == typeof n && n.apply(this, arguments);
            });
          }
          return Object.defineProperty(t, i, { value: e }), t;
        })(s.close)),
        (s.closeSync = (function (e) {
          function t(t) {
            e.apply(s, arguments), m();
          }
          return Object.defineProperty(t, i, { value: e }), t;
        })(s.closeSync)),
        /\bgfs4\b/i.test(process.env.NODE_DEBUG || "") &&
          process.on("exit", function () {
            h(s[r]), n("assert").equal(s[r].length, 0);
          });
    }
    function p(e) {
      o(e),
        (e.gracefulify = p),
        (e.createReadStream = function (t, n) {
          return new e.ReadStream(t, n);
        }),
        (e.createWriteStream = function (t, n) {
          return new e.WriteStream(t, n);
        });
      var t = e.readFile;
      e.readFile = function (e, n, r) {
        "function" == typeof n && ((r = n), (n = null));
        return (function e(n, r, i) {
          return t(n, r, function (t) {
            !t || ("EMFILE" !== t.code && "ENFILE" !== t.code)
              ? ("function" == typeof i && i.apply(this, arguments), m())
              : f([e, [n, r, i]]);
          });
        })(e, n, r);
      };
      var n = e.writeFile;
      e.writeFile = function (e, t, r, i) {
        "function" == typeof r && ((i = r), (r = null));
        return (function e(t, r, i, s) {
          return n(t, r, i, function (n) {
            !n || ("EMFILE" !== n.code && "ENFILE" !== n.code)
              ? ("function" == typeof s && s.apply(this, arguments), m())
              : f([e, [t, r, i, s]]);
          });
        })(e, t, r, i);
      };
      var r = e.appendFile;
      r &&
        (e.appendFile = function (e, t, n, i) {
          "function" == typeof n && ((i = n), (n = null));
          return (function e(t, n, i, s) {
            return r(t, n, i, function (r) {
              !r || ("EMFILE" !== r.code && "ENFILE" !== r.code)
                ? ("function" == typeof s && s.apply(this, arguments), m())
                : f([e, [t, n, i, s]]);
            });
          })(e, t, n, i);
        });
      var i = e.readdir;
      function s(t) {
        return i.apply(e, t);
      }
      if (
        ((e.readdir = function (e, t, n) {
          var r = [e];
          "function" != typeof t ? r.push(t) : (n = t);
          return (
            r.push(function (e, t) {
              t && t.sort && t.sort();
              !e || ("EMFILE" !== e.code && "ENFILE" !== e.code)
                ? ("function" == typeof n && n.apply(this, arguments), m())
                : f([s, [r]]);
            }),
            s(r)
          );
        }),
        "v0.8" === process.version.substr(0, 4))
      ) {
        var u = a(e);
        (g = u.ReadStream), (y = u.WriteStream);
      }
      var c = e.ReadStream;
      c &&
        ((g.prototype = Object.create(c.prototype)),
        (g.prototype.open = function () {
          var e = this;
          E(e.path, e.flags, e.mode, function (t, n) {
            t
              ? (e.autoClose && e.destroy(), e.emit("error", t))
              : ((e.fd = n), e.emit("open", n), e.read());
          });
        }));
      var l = e.WriteStream;
      l &&
        ((y.prototype = Object.create(l.prototype)),
        (y.prototype.open = function () {
          var e = this;
          E(e.path, e.flags, e.mode, function (t, n) {
            t
              ? (e.destroy(), e.emit("error", t))
              : ((e.fd = n), e.emit("open", n));
          });
        })),
        Object.defineProperty(e, "ReadStream", {
          get: function () {
            return g;
          },
          set: function (e) {
            g = e;
          },
          enumerable: !0,
          configurable: !0,
        }),
        Object.defineProperty(e, "WriteStream", {
          get: function () {
            return y;
          },
          set: function (e) {
            y = e;
          },
          enumerable: !0,
          configurable: !0,
        });
      var h = g;
      Object.defineProperty(e, "FileReadStream", {
        get: function () {
          return h;
        },
        set: function (e) {
          h = e;
        },
        enumerable: !0,
        configurable: !0,
      });
      var d = y;
      function g(e, t) {
        return this instanceof g
          ? (c.apply(this, arguments), this)
          : g.apply(Object.create(g.prototype), arguments);
      }
      function y(e, t) {
        return this instanceof y
          ? (l.apply(this, arguments), this)
          : y.apply(Object.create(y.prototype), arguments);
      }
      Object.defineProperty(e, "FileWriteStream", {
        get: function () {
          return d;
        },
        set: function (e) {
          d = e;
        },
        enumerable: !0,
        configurable: !0,
      });
      var v = e.open;
      function E(e, t, n, r) {
        return (
          "function" == typeof n && ((r = n), (n = null)),
          (function e(t, n, r, i) {
            return v(t, n, r, function (s, o) {
              !s || ("EMFILE" !== s.code && "ENFILE" !== s.code)
                ? ("function" == typeof i && i.apply(this, arguments), m())
                : f([e, [t, n, r, i]]);
            });
          })(e, t, n, r)
        );
      }
      return (e.open = E), e;
    }
    function f(e) {
      h("ENQUEUE", e[0].name, e[1]), s[r].push(e);
    }
    function m() {
      var e = s[r].shift();
      e && (h("RETRY", e[0].name, e[1]), e[0].apply(null, e[1]));
    }
    global[r] || l(global, s[r]),
      (e.exports = p(u(s))),
      process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH &&
        !s.__patched &&
        ((e.exports = p(s)), (s.__patched = !0));
  },
  "./node_modules/graceful-fs/legacy-streams.js": function (e, t, n) {
    var r = n("stream").Stream;
    e.exports = function (e) {
      return {
        ReadStream: function t(n, i) {
          if (!(this instanceof t)) return new t(n, i);
          r.call(this);
          var s = this;
          (this.path = n),
            (this.fd = null),
            (this.readable = !0),
            (this.paused = !1),
            (this.flags = "r"),
            (this.mode = 438),
            (this.bufferSize = 65536),
            (i = i || {});
          for (var o = Object.keys(i), a = 0, u = o.length; a < u; a++) {
            var c = o[a];
            this[c] = i[c];
          }
          this.encoding && this.setEncoding(this.encoding);
          if (void 0 !== this.start) {
            if ("number" != typeof this.start)
              throw TypeError("start must be a Number");
            if (void 0 === this.end) this.end = 1 / 0;
            else if ("number" != typeof this.end)
              throw TypeError("end must be a Number");
            if (this.start > this.end) throw new Error("start must be <= end");
            this.pos = this.start;
          }
          if (null !== this.fd)
            return void process.nextTick(function () {
              s._read();
            });
          e.open(this.path, this.flags, this.mode, function (e, t) {
            if (e) return s.emit("error", e), void (s.readable = !1);
            (s.fd = t), s.emit("open", t), s._read();
          });
        },
        WriteStream: function t(n, i) {
          if (!(this instanceof t)) return new t(n, i);
          r.call(this),
            (this.path = n),
            (this.fd = null),
            (this.writable = !0),
            (this.flags = "w"),
            (this.encoding = "binary"),
            (this.mode = 438),
            (this.bytesWritten = 0),
            (i = i || {});
          for (var s = Object.keys(i), o = 0, a = s.length; o < a; o++) {
            var u = s[o];
            this[u] = i[u];
          }
          if (void 0 !== this.start) {
            if ("number" != typeof this.start)
              throw TypeError("start must be a Number");
            if (this.start < 0) throw new Error("start must be >= zero");
            this.pos = this.start;
          }
          (this.busy = !1),
            (this._queue = []),
            null === this.fd &&
              ((this._open = e.open),
              this._queue.push([
                this._open,
                this.path,
                this.flags,
                this.mode,
                void 0,
              ]),
              this.flush());
        },
      };
    };
  },
  "./node_modules/graceful-fs/polyfills.js": function (e, t, n) {
    var r = n("constants"),
      i = process.cwd,
      s = null,
      o = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function () {
      return s || (s = i.call(process)), s;
    };
    try {
      process.cwd();
    } catch (e) {}
    var a = process.chdir;
    (process.chdir = function (e) {
      (s = null), a.call(process, e);
    }),
      (e.exports = function (e) {
        r.hasOwnProperty("O_SYMLINK") &&
          process.version.match(/^v0\.6\.[0-2]|^v0\.5\./) &&
          (function (e) {
            (e.lchmod = function (t, n, i) {
              e.open(t, r.O_WRONLY | r.O_SYMLINK, n, function (t, r) {
                t
                  ? i && i(t)
                  : e.fchmod(r, n, function (t) {
                      e.close(r, function (e) {
                        i && i(t || e);
                      });
                    });
              });
            }),
              (e.lchmodSync = function (t, n) {
                var i,
                  s = e.openSync(t, r.O_WRONLY | r.O_SYMLINK, n),
                  o = !0;
                try {
                  (i = e.fchmodSync(s, n)), (o = !1);
                } finally {
                  if (o)
                    try {
                      e.closeSync(s);
                    } catch (e) {}
                  else e.closeSync(s);
                }
                return i;
              });
          })(e);
        e.lutimes ||
          (function (e) {
            r.hasOwnProperty("O_SYMLINK")
              ? ((e.lutimes = function (t, n, i, s) {
                  e.open(t, r.O_SYMLINK, function (t, r) {
                    t
                      ? s && s(t)
                      : e.futimes(r, n, i, function (t) {
                          e.close(r, function (e) {
                            s && s(t || e);
                          });
                        });
                  });
                }),
                (e.lutimesSync = function (t, n, i) {
                  var s,
                    o = e.openSync(t, r.O_SYMLINK),
                    a = !0;
                  try {
                    (s = e.futimesSync(o, n, i)), (a = !1);
                  } finally {
                    if (a)
                      try {
                        e.closeSync(o);
                      } catch (e) {}
                    else e.closeSync(o);
                  }
                  return s;
                }))
              : ((e.lutimes = function (e, t, n, r) {
                  r && process.nextTick(r);
                }),
                (e.lutimesSync = function () {}));
          })(e);
        (e.chown = s(e.chown)),
          (e.fchown = s(e.fchown)),
          (e.lchown = s(e.lchown)),
          (e.chmod = n(e.chmod)),
          (e.fchmod = n(e.fchmod)),
          (e.lchmod = n(e.lchmod)),
          (e.chownSync = a(e.chownSync)),
          (e.fchownSync = a(e.fchownSync)),
          (e.lchownSync = a(e.lchownSync)),
          (e.chmodSync = i(e.chmodSync)),
          (e.fchmodSync = i(e.fchmodSync)),
          (e.lchmodSync = i(e.lchmodSync)),
          (e.stat = u(e.stat)),
          (e.fstat = u(e.fstat)),
          (e.lstat = u(e.lstat)),
          (e.statSync = c(e.statSync)),
          (e.fstatSync = c(e.fstatSync)),
          (e.lstatSync = c(e.lstatSync)),
          e.lchmod ||
            ((e.lchmod = function (e, t, n) {
              n && process.nextTick(n);
            }),
            (e.lchmodSync = function () {}));
        e.lchown ||
          ((e.lchown = function (e, t, n, r) {
            r && process.nextTick(r);
          }),
          (e.lchownSync = function () {}));
        "win32" === o &&
          (e.rename =
            ((t = e.rename),
            function (n, r, i) {
              var s = Date.now(),
                o = 0;
              t(n, r, function a(u) {
                if (
                  u &&
                  ("EACCES" === u.code || "EPERM" === u.code) &&
                  Date.now() - s < 6e4
                )
                  return (
                    setTimeout(function () {
                      e.stat(r, function (e, s) {
                        e && "ENOENT" === e.code ? t(n, r, a) : i(u);
                      });
                    }, o),
                    void (o < 100 && (o += 10))
                  );
                i && i(u);
              });
            }));
        var t;
        function n(t) {
          return t
            ? function (n, r, i) {
                return t.call(e, n, r, function (e) {
                  l(e) && (e = null), i && i.apply(this, arguments);
                });
              }
            : t;
        }
        function i(t) {
          return t
            ? function (n, r) {
                try {
                  return t.call(e, n, r);
                } catch (e) {
                  if (!l(e)) throw e;
                }
              }
            : t;
        }
        function s(t) {
          return t
            ? function (n, r, i, s) {
                return t.call(e, n, r, i, function (e) {
                  l(e) && (e = null), s && s.apply(this, arguments);
                });
              }
            : t;
        }
        function a(t) {
          return t
            ? function (n, r, i) {
                try {
                  return t.call(e, n, r, i);
                } catch (e) {
                  if (!l(e)) throw e;
                }
              }
            : t;
        }
        function u(t) {
          return t
            ? function (n, r, i) {
                function s(e, t) {
                  t &&
                    (t.uid < 0 && (t.uid += 4294967296),
                    t.gid < 0 && (t.gid += 4294967296)),
                    i && i.apply(this, arguments);
                }
                return (
                  "function" == typeof r && ((i = r), (r = null)),
                  r ? t.call(e, n, r, s) : t.call(e, n, s)
                );
              }
            : t;
        }
        function c(t) {
          return t
            ? function (n, r) {
                var i = r ? t.call(e, n, r) : t.call(e, n);
                return (
                  i.uid < 0 && (i.uid += 4294967296),
                  i.gid < 0 && (i.gid += 4294967296),
                  i
                );
              }
            : t;
        }
        function l(e) {
          return (
            !e ||
            "ENOSYS" === e.code ||
            !(
              (process.getuid && 0 === process.getuid()) ||
              ("EINVAL" !== e.code && "EPERM" !== e.code)
            )
          );
        }
        (e.read = (function (t) {
          function n(n, r, i, s, o, a) {
            var u;
            if (a && "function" == typeof a) {
              var c = 0;
              u = function (l, h, d) {
                if (l && "EAGAIN" === l.code && c < 10)
                  return c++, t.call(e, n, r, i, s, o, u);
                a.apply(this, arguments);
              };
            }
            return t.call(e, n, r, i, s, o, u);
          }
          return (n.__proto__ = t), n;
        })(e.read)),
          (e.readSync =
            ((h = e.readSync),
            function (t, n, r, i, s) {
              for (var o = 0; ; )
                try {
                  return h.call(e, t, n, r, i, s);
                } catch (e) {
                  if ("EAGAIN" === e.code && o < 10) {
                    o++;
                    continue;
                  }
                  throw e;
                }
            }));
        var h;
      });
  },
  "./node_modules/inflight/inflight.js": function (e, t, n) {
    var r = n("./node_modules/wrappy/wrappy.js"),
      i = Object.create(null),
      s = n("./node_modules/once/once.js");
    function o(e) {
      for (var t = e.length, n = [], r = 0; r < t; r++) n[r] = e[r];
      return n;
    }
    e.exports = r(function (e, t) {
      return i[e]
        ? (i[e].push(t), null)
        : ((i[e] = [t]),
          (function (e) {
            return s(function t() {
              var n = i[e],
                r = n.length,
                s = o(arguments);
              try {
                for (var a = 0; a < r; a++) n[a].apply(null, s);
              } finally {
                n.length > r
                  ? (n.splice(0, r),
                    process.nextTick(function () {
                      t.apply(null, s);
                    }))
                  : delete i[e];
              }
            });
          })(e));
    });
  },
  "./node_modules/inherits/inherits.js": function (e, t, n) {
    try {
      var r = n("util");
      if ("function" != typeof r.inherits) throw "";
      e.exports = r.inherits;
    } catch (t) {
      e.exports = n("./node_modules/inherits/inherits_browser.js");
    }
  },
  "./node_modules/inherits/inherits_browser.js": function (e, t) {
    "function" == typeof Object.create
      ? (e.exports = function (e, t) {
          t &&
            ((e.super_ = t),
            (e.prototype = Object.create(t.prototype, {
              constructor: {
                value: e,
                enumerable: !1,
                writable: !0,
                configurable: !0,
              },
            })));
        })
      : (e.exports = function (e, t) {
          if (t) {
            e.super_ = t;
            var n = function () {};
            (n.prototype = t.prototype),
              (e.prototype = new n()),
              (e.prototype.constructor = e);
          }
        });
  },
  "./node_modules/js-yaml/index.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml.js");
    e.exports = r;
  },
  "./node_modules/js-yaml/lib/js-yaml.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/loader.js"),
      i = n("./node_modules/js-yaml/lib/js-yaml/dumper.js");
    function s(e) {
      return function () {
        throw new Error("Function " + e + " is deprecated and cannot be used.");
      };
    }
    (e.exports.Type = n("./node_modules/js-yaml/lib/js-yaml/type.js")),
      (e.exports.Schema = n("./node_modules/js-yaml/lib/js-yaml/schema.js")),
      (e.exports.FAILSAFE_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/failsafe.js"
      )),
      (e.exports.JSON_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/json.js"
      )),
      (e.exports.CORE_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/core.js"
      )),
      (e.exports.DEFAULT_SAFE_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/default_safe.js"
      )),
      (e.exports.DEFAULT_FULL_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/default_full.js"
      )),
      (e.exports.load = r.load),
      (e.exports.loadAll = r.loadAll),
      (e.exports.safeLoad = r.safeLoad),
      (e.exports.safeLoadAll = r.safeLoadAll),
      (e.exports.dump = i.dump),
      (e.exports.safeDump = i.safeDump),
      (e.exports.YAMLException = n(
        "./node_modules/js-yaml/lib/js-yaml/exception.js"
      )),
      (e.exports.MINIMAL_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/failsafe.js"
      )),
      (e.exports.SAFE_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/default_safe.js"
      )),
      (e.exports.DEFAULT_SCHEMA = n(
        "./node_modules/js-yaml/lib/js-yaml/schema/default_full.js"
      )),
      (e.exports.scan = s("scan")),
      (e.exports.parse = s("parse")),
      (e.exports.compose = s("compose")),
      (e.exports.addConstructor = s("addConstructor"));
  },
  "./node_modules/js-yaml/lib/js-yaml/common.js": function (e, t, n) {
    "use strict";
    function r(e) {
      return null == e;
    }
    (e.exports.isNothing = r),
      (e.exports.isObject = function (e) {
        return "object" == typeof e && null !== e;
      }),
      (e.exports.toArray = function (e) {
        return Array.isArray(e) ? e : r(e) ? [] : [e];
      }),
      (e.exports.repeat = function (e, t) {
        var n,
          r = "";
        for (n = 0; n < t; n += 1) r += e;
        return r;
      }),
      (e.exports.isNegativeZero = function (e) {
        return 0 === e && Number.NEGATIVE_INFINITY === 1 / e;
      }),
      (e.exports.extend = function (e, t) {
        var n, r, i, s;
        if (t)
          for (n = 0, r = (s = Object.keys(t)).length; n < r; n += 1)
            e[(i = s[n])] = t[i];
        return e;
      });
  },
  "./node_modules/js-yaml/lib/js-yaml/dumper.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/common.js"),
      i = n("./node_modules/js-yaml/lib/js-yaml/exception.js"),
      s = n("./node_modules/js-yaml/lib/js-yaml/schema/default_full.js"),
      o = n("./node_modules/js-yaml/lib/js-yaml/schema/default_safe.js"),
      a = Object.prototype.toString,
      u = Object.prototype.hasOwnProperty,
      c = {
        0: "\\0",
        7: "\\a",
        8: "\\b",
        9: "\\t",
        10: "\\n",
        11: "\\v",
        12: "\\f",
        13: "\\r",
        27: "\\e",
        34: '\\"',
        92: "\\\\",
        133: "\\N",
        160: "\\_",
        8232: "\\L",
        8233: "\\P",
      },
      l = [
        "y",
        "Y",
        "yes",
        "Yes",
        "YES",
        "on",
        "On",
        "ON",
        "n",
        "N",
        "no",
        "No",
        "NO",
        "off",
        "Off",
        "OFF",
      ];
    function h(e) {
      var t, n, s;
      if (((t = e.toString(16).toUpperCase()), e <= 255)) (n = "x"), (s = 2);
      else if (e <= 65535) (n = "u"), (s = 4);
      else {
        if (!(e <= 4294967295))
          throw new i(
            "code point within a string may not be greater than 0xFFFFFFFF"
          );
        (n = "U"), (s = 8);
      }
      return "\\" + n + r.repeat("0", s - t.length) + t;
    }
    function d(e) {
      (this.schema = e.schema || s),
        (this.indent = Math.max(1, e.indent || 2)),
        (this.noArrayIndent = e.noArrayIndent || !1),
        (this.skipInvalid = e.skipInvalid || !1),
        (this.flowLevel = r.isNothing(e.flowLevel) ? -1 : e.flowLevel),
        (this.styleMap = (function (e, t) {
          var n, r, i, s, o, a, c;
          if (null === t) return {};
          for (n = {}, i = 0, s = (r = Object.keys(t)).length; i < s; i += 1)
            (o = r[i]),
              (a = String(t[o])),
              "!!" === o.slice(0, 2) && (o = "tag:yaml.org,2002:" + o.slice(2)),
              (c = e.compiledTypeMap.fallback[o]) &&
                u.call(c.styleAliases, a) &&
                (a = c.styleAliases[a]),
              (n[o] = a);
          return n;
        })(this.schema, e.styles || null)),
        (this.sortKeys = e.sortKeys || !1),
        (this.lineWidth = e.lineWidth || 80),
        (this.noRefs = e.noRefs || !1),
        (this.noCompatMode = e.noCompatMode || !1),
        (this.condenseFlow = e.condenseFlow || !1),
        (this.implicitTypes = this.schema.compiledImplicit),
        (this.explicitTypes = this.schema.compiledExplicit),
        (this.tag = null),
        (this.result = ""),
        (this.duplicates = []),
        (this.usedDuplicates = null);
    }
    function p(e, t) {
      for (
        var n, i = r.repeat(" ", t), s = 0, o = -1, a = "", u = e.length;
        s < u;

      )
        -1 === (o = e.indexOf("\n", s))
          ? ((n = e.slice(s)), (s = u))
          : ((n = e.slice(s, o + 1)), (s = o + 1)),
          n.length && "\n" !== n && (a += i),
          (a += n);
      return a;
    }
    function f(e, t) {
      return "\n" + r.repeat(" ", e.indent * t);
    }
    function m(e) {
      return 32 === e || 9 === e;
    }
    function g(e) {
      return (
        (32 <= e && e <= 126) ||
        (161 <= e && e <= 55295 && 8232 !== e && 8233 !== e) ||
        (57344 <= e && e <= 65533 && 65279 !== e) ||
        (65536 <= e && e <= 1114111)
      );
    }
    function y(e, t) {
      return (
        g(e) &&
        65279 !== e &&
        44 !== e &&
        91 !== e &&
        93 !== e &&
        123 !== e &&
        125 !== e &&
        58 !== e &&
        (35 !== e ||
          (t &&
            (function (e) {
              return g(e) && !m(e) && 65279 !== e && 13 !== e && 10 !== e;
            })(t)))
      );
    }
    function v(e) {
      return /^\n* /.test(e);
    }
    function E(e, t, n, r, i) {
      var s,
        o,
        a,
        u,
        c = !1,
        l = !1,
        h = -1 !== r,
        d = -1,
        p =
          g((u = e.charCodeAt(0))) &&
          65279 !== u &&
          !m(u) &&
          45 !== u &&
          63 !== u &&
          58 !== u &&
          44 !== u &&
          91 !== u &&
          93 !== u &&
          123 !== u &&
          125 !== u &&
          35 !== u &&
          38 !== u &&
          42 !== u &&
          33 !== u &&
          124 !== u &&
          61 !== u &&
          62 !== u &&
          39 !== u &&
          34 !== u &&
          37 !== u &&
          64 !== u &&
          96 !== u &&
          !m(e.charCodeAt(e.length - 1));
      if (t)
        for (s = 0; s < e.length; s++) {
          if (!g((o = e.charCodeAt(s)))) return 5;
          (a = s > 0 ? e.charCodeAt(s - 1) : null), (p = p && y(o, a));
        }
      else {
        for (s = 0; s < e.length; s++) {
          if (10 === (o = e.charCodeAt(s)))
            (c = !0),
              h && ((l = l || (s - d - 1 > r && " " !== e[d + 1])), (d = s));
          else if (!g(o)) return 5;
          (a = s > 0 ? e.charCodeAt(s - 1) : null), (p = p && y(o, a));
        }
        l = l || (h && s - d - 1 > r && " " !== e[d + 1]);
      }
      return c || l ? (n > 9 && v(e) ? 5 : l ? 4 : 3) : p && !i(e) ? 1 : 2;
    }
    function x(e, t, n, r) {
      e.dump = (function () {
        if (0 === t.length) return "''";
        if (!e.noCompatMode && -1 !== l.indexOf(t)) return "'" + t + "'";
        var s = e.indent * Math.max(1, n),
          o =
            -1 === e.lineWidth
              ? -1
              : Math.max(Math.min(e.lineWidth, 40), e.lineWidth - s),
          a = r || (e.flowLevel > -1 && n >= e.flowLevel);
        switch (
          E(t, a, e.indent, o, function (t) {
            return (function (e, t) {
              var n, r;
              for (n = 0, r = e.implicitTypes.length; n < r; n += 1)
                if (e.implicitTypes[n].resolve(t)) return !0;
              return !1;
            })(e, t);
          })
        ) {
          case 1:
            return t;
          case 2:
            return "'" + t.replace(/'/g, "''") + "'";
          case 3:
            return "|" + b(t, e.indent) + D(p(t, s));
          case 4:
            return (
              ">" +
              b(t, e.indent) +
              D(
                p(
                  (function (e, t) {
                    var n,
                      r,
                      i = /(\n+)([^\n]*)/g,
                      s =
                        ((a = e.indexOf("\n")),
                        (a = -1 !== a ? a : e.length),
                        (i.lastIndex = a),
                        w(e.slice(0, a), t)),
                      o = "\n" === e[0] || " " === e[0];
                    var a;
                    for (; (r = i.exec(e)); ) {
                      var u = r[1],
                        c = r[2];
                      (n = " " === c[0]),
                        (s += u + (o || n || "" === c ? "" : "\n") + w(c, t)),
                        (o = n);
                    }
                    return s;
                  })(t, o),
                  s
                )
              )
            );
          case 5:
            return (
              '"' +
              (function (e) {
                for (var t, n, r, i = "", s = 0; s < e.length; s++)
                  (t = e.charCodeAt(s)) >= 55296 &&
                  t <= 56319 &&
                  (n = e.charCodeAt(s + 1)) >= 56320 &&
                  n <= 57343
                    ? ((i += h(1024 * (t - 55296) + n - 56320 + 65536)), s++)
                    : ((r = c[t]), (i += !r && g(t) ? e[s] : r || h(t)));
                return i;
              })(t) +
              '"'
            );
          default:
            throw new i("impossible error: invalid scalar style");
        }
      })();
    }
    function b(e, t) {
      var n = v(e) ? String(t) : "",
        r = "\n" === e[e.length - 1];
      return (
        n +
        (r && ("\n" === e[e.length - 2] || "\n" === e) ? "+" : r ? "" : "-") +
        "\n"
      );
    }
    function D(e) {
      return "\n" === e[e.length - 1] ? e.slice(0, -1) : e;
    }
    function w(e, t) {
      if ("" === e || " " === e[0]) return e;
      for (
        var n, r, i = / [^ ]/g, s = 0, o = 0, a = 0, u = "";
        (n = i.exec(e));

      )
        (a = n.index) - s > t &&
          ((r = o > s ? o : a), (u += "\n" + e.slice(s, r)), (s = r + 1)),
          (o = a);
      return (
        (u += "\n"),
        e.length - s > t && o > s
          ? (u += e.slice(s, o) + "\n" + e.slice(o + 1))
          : (u += e.slice(s)),
        u.slice(1)
      );
    }
    function _(e, t, n) {
      var r, s, o, c, l, h;
      for (
        o = 0, c = (s = n ? e.explicitTypes : e.implicitTypes).length;
        o < c;
        o += 1
      )
        if (
          ((l = s[o]).instanceOf || l.predicate) &&
          (!l.instanceOf ||
            ("object" == typeof t && t instanceof l.instanceOf)) &&
          (!l.predicate || l.predicate(t))
        ) {
          if (((e.tag = n ? l.tag : "?"), l.represent)) {
            if (
              ((h = e.styleMap[l.tag] || l.defaultStyle),
              "[object Function]" === a.call(l.represent))
            )
              r = l.represent(t, h);
            else {
              if (!u.call(l.represent, h))
                throw new i(
                  "!<" + l.tag + '> tag resolver accepts not "' + h + '" style'
                );
              r = l.represent[h](t, h);
            }
            e.dump = r;
          }
          return !0;
        }
      return !1;
    }
    function C(e, t, n, r, s, o) {
      (e.tag = null), (e.dump = n), _(e, n, !1) || _(e, n, !0);
      var u = a.call(e.dump);
      r && (r = e.flowLevel < 0 || e.flowLevel > t);
      var c,
        l,
        h = "[object Object]" === u || "[object Array]" === u;
      if (
        (h && (l = -1 !== (c = e.duplicates.indexOf(n))),
        ((null !== e.tag && "?" !== e.tag) || l || (2 !== e.indent && t > 0)) &&
          (s = !1),
        l && e.usedDuplicates[c])
      )
        e.dump = "*ref_" + c;
      else {
        if (
          (h && l && !e.usedDuplicates[c] && (e.usedDuplicates[c] = !0),
          "[object Object]" === u)
        )
          r && 0 !== Object.keys(e.dump).length
            ? (!(function (e, t, n, r) {
                var s,
                  o,
                  a,
                  u,
                  c,
                  l,
                  h = "",
                  d = e.tag,
                  p = Object.keys(n);
                if (!0 === e.sortKeys) p.sort();
                else if ("function" == typeof e.sortKeys) p.sort(e.sortKeys);
                else if (e.sortKeys)
                  throw new i("sortKeys must be a boolean or a function");
                for (s = 0, o = p.length; s < o; s += 1)
                  (l = ""),
                    (r && 0 === s) || (l += f(e, t)),
                    (u = n[(a = p[s])]),
                    C(e, t + 1, a, !0, !0, !0) &&
                      ((c =
                        (null !== e.tag && "?" !== e.tag) ||
                        (e.dump && e.dump.length > 1024)) &&
                        (e.dump && 10 === e.dump.charCodeAt(0)
                          ? (l += "?")
                          : (l += "? ")),
                      (l += e.dump),
                      c && (l += f(e, t)),
                      C(e, t + 1, u, !0, c) &&
                        (e.dump && 10 === e.dump.charCodeAt(0)
                          ? (l += ":")
                          : (l += ": "),
                        (h += l += e.dump)));
                (e.tag = d), (e.dump = h || "{}");
              })(e, t, e.dump, s),
              l && (e.dump = "&ref_" + c + e.dump))
            : (!(function (e, t, n) {
                var r,
                  i,
                  s,
                  o,
                  a,
                  u = "",
                  c = e.tag,
                  l = Object.keys(n);
                for (r = 0, i = l.length; r < i; r += 1)
                  (a = ""),
                    0 !== r && (a += ", "),
                    e.condenseFlow && (a += '"'),
                    (o = n[(s = l[r])]),
                    C(e, t, s, !1, !1) &&
                      (e.dump.length > 1024 && (a += "? "),
                      (a +=
                        e.dump +
                        (e.condenseFlow ? '"' : "") +
                        ":" +
                        (e.condenseFlow ? "" : " ")),
                      C(e, t, o, !1, !1) && (u += a += e.dump));
                (e.tag = c), (e.dump = "{" + u + "}");
              })(e, t, e.dump),
              l && (e.dump = "&ref_" + c + " " + e.dump));
        else if ("[object Array]" === u) {
          var d = e.noArrayIndent && t > 0 ? t - 1 : t;
          r && 0 !== e.dump.length
            ? (!(function (e, t, n, r) {
                var i,
                  s,
                  o = "",
                  a = e.tag;
                for (i = 0, s = n.length; i < s; i += 1)
                  C(e, t + 1, n[i], !0, !0) &&
                    ((r && 0 === i) || (o += f(e, t)),
                    e.dump && 10 === e.dump.charCodeAt(0)
                      ? (o += "-")
                      : (o += "- "),
                    (o += e.dump));
                (e.tag = a), (e.dump = o || "[]");
              })(e, d, e.dump, s),
              l && (e.dump = "&ref_" + c + e.dump))
            : (!(function (e, t, n) {
                var r,
                  i,
                  s = "",
                  o = e.tag;
                for (r = 0, i = n.length; r < i; r += 1)
                  C(e, t, n[r], !1, !1) &&
                    (0 !== r && (s += "," + (e.condenseFlow ? "" : " ")),
                    (s += e.dump));
                (e.tag = o), (e.dump = "[" + s + "]");
              })(e, d, e.dump),
              l && (e.dump = "&ref_" + c + " " + e.dump));
        } else {
          if ("[object String]" !== u) {
            if (e.skipInvalid) return !1;
            throw new i("unacceptable kind of an object to dump " + u);
          }
          "?" !== e.tag && x(e, e.dump, t, o);
        }
        null !== e.tag &&
          "?" !== e.tag &&
          (e.dump = "!<" + e.tag + "> " + e.dump);
      }
      return !0;
    }
    function S(e, t) {
      var n,
        r,
        i = [],
        s = [];
      for (
        (function e(t, n, r) {
          var i, s, o;
          if (null !== t && "object" == typeof t)
            if (-1 !== (s = n.indexOf(t))) -1 === r.indexOf(s) && r.push(s);
            else if ((n.push(t), Array.isArray(t)))
              for (s = 0, o = t.length; s < o; s += 1) e(t[s], n, r);
            else
              for (i = Object.keys(t), s = 0, o = i.length; s < o; s += 1)
                e(t[i[s]], n, r);
        })(e, i, s),
          n = 0,
          r = s.length;
        n < r;
        n += 1
      )
        t.duplicates.push(i[s[n]]);
      t.usedDuplicates = new Array(r);
    }
    function A(e, t) {
      var n = new d((t = t || {}));
      return n.noRefs || S(e, n), C(n, 0, e, !0, !0) ? n.dump + "\n" : "";
    }
    (e.exports.dump = A),
      (e.exports.safeDump = function (e, t) {
        return A(e, r.extend({ schema: o }, t));
      });
  },
  "./node_modules/js-yaml/lib/js-yaml/exception.js": function (e, t, n) {
    "use strict";
    function r(e, t) {
      Error.call(this),
        (this.name = "YAMLException"),
        (this.reason = e),
        (this.mark = t),
        (this.message =
          (this.reason || "(unknown reason)") +
          (this.mark ? " " + this.mark.toString() : "")),
        Error.captureStackTrace
          ? Error.captureStackTrace(this, this.constructor)
          : (this.stack = new Error().stack || "");
    }
    (r.prototype = Object.create(Error.prototype)),
      (r.prototype.constructor = r),
      (r.prototype.toString = function (e) {
        var t = this.name + ": ";
        return (
          (t += this.reason || "(unknown reason)"),
          !e && this.mark && (t += " " + this.mark.toString()),
          t
        );
      }),
      (e.exports = r);
  },
  "./node_modules/js-yaml/lib/js-yaml/loader.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/common.js"),
      i = n("./node_modules/js-yaml/lib/js-yaml/exception.js"),
      s = n("./node_modules/js-yaml/lib/js-yaml/mark.js"),
      o = n("./node_modules/js-yaml/lib/js-yaml/schema/default_safe.js"),
      a = n("./node_modules/js-yaml/lib/js-yaml/schema/default_full.js"),
      u = Object.prototype.hasOwnProperty,
      c = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,
      l = /[\x85\u2028\u2029]/,
      h = /[,\[\]\{\}]/,
      d = /^(?:!|!!|![a-z\-]+!)$/i,
      p = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
    function f(e) {
      return Object.prototype.toString.call(e);
    }
    function m(e) {
      return 10 === e || 13 === e;
    }
    function g(e) {
      return 9 === e || 32 === e;
    }
    function y(e) {
      return 9 === e || 32 === e || 10 === e || 13 === e;
    }
    function v(e) {
      return 44 === e || 91 === e || 93 === e || 123 === e || 125 === e;
    }
    function E(e) {
      var t;
      return 48 <= e && e <= 57
        ? e - 48
        : 97 <= (t = 32 | e) && t <= 102
        ? t - 97 + 10
        : -1;
    }
    function x(e) {
      return 48 === e
        ? "\0"
        : 97 === e
        ? ""
        : 98 === e
        ? "\b"
        : 116 === e || 9 === e
        ? "\t"
        : 110 === e
        ? "\n"
        : 118 === e
        ? "\v"
        : 102 === e
        ? "\f"
        : 114 === e
        ? "\r"
        : 101 === e
        ? ""
        : 32 === e
        ? " "
        : 34 === e
        ? '"'
        : 47 === e
        ? "/"
        : 92 === e
        ? "\\"
        : 78 === e
        ? ""
        : 95 === e
        ? " "
        : 76 === e
        ? "\u2028"
        : 80 === e
        ? "\u2029"
        : "";
    }
    function b(e) {
      return e <= 65535
        ? String.fromCharCode(e)
        : String.fromCharCode(
            55296 + ((e - 65536) >> 10),
            56320 + ((e - 65536) & 1023)
          );
    }
    for (var D = new Array(256), w = new Array(256), _ = 0; _ < 256; _++)
      (D[_] = x(_) ? 1 : 0), (w[_] = x(_));
    function C(e, t) {
      (this.input = e),
        (this.filename = t.filename || null),
        (this.schema = t.schema || a),
        (this.onWarning = t.onWarning || null),
        (this.legacy = t.legacy || !1),
        (this.json = t.json || !1),
        (this.listener = t.listener || null),
        (this.implicitTypes = this.schema.compiledImplicit),
        (this.typeMap = this.schema.compiledTypeMap),
        (this.length = e.length),
        (this.position = 0),
        (this.line = 0),
        (this.lineStart = 0),
        (this.lineIndent = 0),
        (this.documents = []);
    }
    function S(e, t) {
      return new i(
        t,
        new s(e.filename, e.input, e.position, e.line, e.position - e.lineStart)
      );
    }
    function A(e, t) {
      throw S(e, t);
    }
    function j(e, t) {
      e.onWarning && e.onWarning.call(null, S(e, t));
    }
    var F = {
      YAML: function (e, t, n) {
        var r, i, s;
        null !== e.version && A(e, "duplication of %YAML directive"),
          1 !== n.length && A(e, "YAML directive accepts exactly one argument"),
          null === (r = /^([0-9]+)\.([0-9]+)$/.exec(n[0])) &&
            A(e, "ill-formed argument of the YAML directive"),
          (i = parseInt(r[1], 10)),
          (s = parseInt(r[2], 10)),
          1 !== i && A(e, "unacceptable YAML version of the document"),
          (e.version = n[0]),
          (e.checkLineBreaks = s < 2),
          1 !== s &&
            2 !== s &&
            j(e, "unsupported YAML version of the document");
      },
      TAG: function (e, t, n) {
        var r, i;
        2 !== n.length && A(e, "TAG directive accepts exactly two arguments"),
          (r = n[0]),
          (i = n[1]),
          d.test(r) ||
            A(e, "ill-formed tag handle (first argument) of the TAG directive"),
          u.call(e.tagMap, r) &&
            A(
              e,
              'there is a previously declared suffix for "' + r + '" tag handle'
            ),
          p.test(i) ||
            A(
              e,
              "ill-formed tag prefix (second argument) of the TAG directive"
            ),
          (e.tagMap[r] = i);
      },
    };
    function k(e, t, n, r) {
      var i, s, o, a;
      if (t < n) {
        if (((a = e.input.slice(t, n)), r))
          for (i = 0, s = a.length; i < s; i += 1)
            9 === (o = a.charCodeAt(i)) ||
              (32 <= o && o <= 1114111) ||
              A(e, "expected valid JSON character");
        else c.test(a) && A(e, "the stream contains non-printable characters");
        e.result += a;
      }
    }
    function T(e, t, n, i) {
      var s, o, a, c;
      for (
        r.isObject(n) ||
          A(
            e,
            "cannot merge mappings; the provided source object is unacceptable"
          ),
          a = 0,
          c = (s = Object.keys(n)).length;
        a < c;
        a += 1
      )
        (o = s[a]), u.call(t, o) || ((t[o] = n[o]), (i[o] = !0));
    }
    function O(e, t, n, r, i, s, o, a) {
      var c, l;
      if (Array.isArray(i))
        for (
          c = 0, l = (i = Array.prototype.slice.call(i)).length;
          c < l;
          c += 1
        )
          Array.isArray(i[c]) &&
            A(e, "nested arrays are not supported inside keys"),
            "object" == typeof i &&
              "[object Object]" === f(i[c]) &&
              (i[c] = "[object Object]");
      if (
        ("object" == typeof i &&
          "[object Object]" === f(i) &&
          (i = "[object Object]"),
        (i = String(i)),
        null === t && (t = {}),
        "tag:yaml.org,2002:merge" === r)
      )
        if (Array.isArray(s))
          for (c = 0, l = s.length; c < l; c += 1) T(e, t, s[c], n);
        else T(e, t, s, n);
      else
        e.json ||
          u.call(n, i) ||
          !u.call(t, i) ||
          ((e.line = o || e.line),
          (e.position = a || e.position),
          A(e, "duplicated mapping key")),
          (t[i] = s),
          delete n[i];
      return t;
    }
    function N(e) {
      var t;
      10 === (t = e.input.charCodeAt(e.position))
        ? e.position++
        : 13 === t
        ? (e.position++, 10 === e.input.charCodeAt(e.position) && e.position++)
        : A(e, "a line break is expected"),
        (e.line += 1),
        (e.lineStart = e.position);
    }
    function I(e, t, n) {
      for (var r = 0, i = e.input.charCodeAt(e.position); 0 !== i; ) {
        for (; g(i); ) i = e.input.charCodeAt(++e.position);
        if (t && 35 === i)
          do {
            i = e.input.charCodeAt(++e.position);
          } while (10 !== i && 13 !== i && 0 !== i);
        if (!m(i)) break;
        for (
          N(e), i = e.input.charCodeAt(e.position), r++, e.lineIndent = 0;
          32 === i;

        )
          e.lineIndent++, (i = e.input.charCodeAt(++e.position));
      }
      return (
        -1 !== n &&
          0 !== r &&
          e.lineIndent < n &&
          j(e, "deficient indentation"),
        r
      );
    }
    function P(e) {
      var t,
        n = e.position;
      return !(
        (45 !== (t = e.input.charCodeAt(n)) && 46 !== t) ||
        t !== e.input.charCodeAt(n + 1) ||
        t !== e.input.charCodeAt(n + 2) ||
        ((n += 3), 0 !== (t = e.input.charCodeAt(n)) && !y(t))
      );
    }
    function R(e, t) {
      1 === t
        ? (e.result += " ")
        : t > 1 && (e.result += r.repeat("\n", t - 1));
    }
    function L(e, t) {
      var n,
        r,
        i = e.tag,
        s = e.anchor,
        o = [],
        a = !1;
      for (
        null !== e.anchor && (e.anchorMap[e.anchor] = o),
          r = e.input.charCodeAt(e.position);
        0 !== r && 45 === r && y(e.input.charCodeAt(e.position + 1));

      )
        if (((a = !0), e.position++, I(e, !0, -1) && e.lineIndent <= t))
          o.push(null), (r = e.input.charCodeAt(e.position));
        else if (
          ((n = e.line),
          U(e, t, 3, !1, !0),
          o.push(e.result),
          I(e, !0, -1),
          (r = e.input.charCodeAt(e.position)),
          (e.line === n || e.lineIndent > t) && 0 !== r)
        )
          A(e, "bad indentation of a sequence entry");
        else if (e.lineIndent < t) break;
      return (
        !!a &&
        ((e.tag = i), (e.anchor = s), (e.kind = "sequence"), (e.result = o), !0)
      );
    }
    function M(e) {
      var t,
        n,
        r,
        i,
        s = !1,
        o = !1;
      if (33 !== (i = e.input.charCodeAt(e.position))) return !1;
      if (
        (null !== e.tag && A(e, "duplication of a tag property"),
        60 === (i = e.input.charCodeAt(++e.position))
          ? ((s = !0), (i = e.input.charCodeAt(++e.position)))
          : 33 === i
          ? ((o = !0), (n = "!!"), (i = e.input.charCodeAt(++e.position)))
          : (n = "!"),
        (t = e.position),
        s)
      ) {
        do {
          i = e.input.charCodeAt(++e.position);
        } while (0 !== i && 62 !== i);
        e.position < e.length
          ? ((r = e.input.slice(t, e.position)),
            (i = e.input.charCodeAt(++e.position)))
          : A(e, "unexpected end of the stream within a verbatim tag");
      } else {
        for (; 0 !== i && !y(i); )
          33 === i &&
            (o
              ? A(e, "tag suffix cannot contain exclamation marks")
              : ((n = e.input.slice(t - 1, e.position + 1)),
                d.test(n) ||
                  A(e, "named tag handle cannot contain such characters"),
                (o = !0),
                (t = e.position + 1))),
            (i = e.input.charCodeAt(++e.position));
        (r = e.input.slice(t, e.position)),
          h.test(r) &&
            A(e, "tag suffix cannot contain flow indicator characters");
      }
      return (
        r &&
          !p.test(r) &&
          A(e, "tag name cannot contain such characters: " + r),
        s
          ? (e.tag = r)
          : u.call(e.tagMap, n)
          ? (e.tag = e.tagMap[n] + r)
          : "!" === n
          ? (e.tag = "!" + r)
          : "!!" === n
          ? (e.tag = "tag:yaml.org,2002:" + r)
          : A(e, 'undeclared tag handle "' + n + '"'),
        !0
      );
    }
    function B(e) {
      var t, n;
      if (38 !== (n = e.input.charCodeAt(e.position))) return !1;
      for (
        null !== e.anchor && A(e, "duplication of an anchor property"),
          n = e.input.charCodeAt(++e.position),
          t = e.position;
        0 !== n && !y(n) && !v(n);

      )
        n = e.input.charCodeAt(++e.position);
      return (
        e.position === t &&
          A(e, "name of an anchor node must contain at least one character"),
        (e.anchor = e.input.slice(t, e.position)),
        !0
      );
    }
    function U(e, t, n, i, s) {
      var o,
        a,
        c,
        l,
        h,
        d,
        p,
        f,
        x = 1,
        _ = !1,
        C = !1;
      if (
        (null !== e.listener && e.listener("open", e),
        (e.tag = null),
        (e.anchor = null),
        (e.kind = null),
        (e.result = null),
        (o = a = c = 4 === n || 3 === n),
        i &&
          I(e, !0, -1) &&
          ((_ = !0),
          e.lineIndent > t
            ? (x = 1)
            : e.lineIndent === t
            ? (x = 0)
            : e.lineIndent < t && (x = -1)),
        1 === x)
      )
        for (; M(e) || B(e); )
          I(e, !0, -1)
            ? ((_ = !0),
              (c = o),
              e.lineIndent > t
                ? (x = 1)
                : e.lineIndent === t
                ? (x = 0)
                : e.lineIndent < t && (x = -1))
            : (c = !1);
      if (
        (c && (c = _ || s),
        (1 !== x && 4 !== n) ||
          ((p = 1 === n || 2 === n ? t : t + 1),
          (f = e.position - e.lineStart),
          1 === x
            ? (c &&
                (L(e, f) ||
                  (function (e, t, n) {
                    var r,
                      i,
                      s,
                      o,
                      a,
                      u = e.tag,
                      c = e.anchor,
                      l = {},
                      h = {},
                      d = null,
                      p = null,
                      f = null,
                      m = !1,
                      v = !1;
                    for (
                      null !== e.anchor && (e.anchorMap[e.anchor] = l),
                        a = e.input.charCodeAt(e.position);
                      0 !== a;

                    ) {
                      if (
                        ((r = e.input.charCodeAt(e.position + 1)),
                        (s = e.line),
                        (o = e.position),
                        (63 !== a && 58 !== a) || !y(r))
                      ) {
                        if (!U(e, n, 2, !1, !0)) break;
                        if (e.line === s) {
                          for (a = e.input.charCodeAt(e.position); g(a); )
                            a = e.input.charCodeAt(++e.position);
                          if (58 === a)
                            y((a = e.input.charCodeAt(++e.position))) ||
                              A(
                                e,
                                "a whitespace character is expected after the key-value separator within a block mapping"
                              ),
                              m && (O(e, l, h, d, p, null), (d = p = f = null)),
                              (v = !0),
                              (m = !1),
                              (i = !1),
                              (d = e.tag),
                              (p = e.result);
                          else {
                            if (!v) return (e.tag = u), (e.anchor = c), !0;
                            A(
                              e,
                              "can not read an implicit mapping pair; a colon is missed"
                            );
                          }
                        } else {
                          if (!v) return (e.tag = u), (e.anchor = c), !0;
                          A(
                            e,
                            "can not read a block mapping entry; a multiline key may not be an implicit key"
                          );
                        }
                      } else
                        63 === a
                          ? (m && (O(e, l, h, d, p, null), (d = p = f = null)),
                            (v = !0),
                            (m = !0),
                            (i = !0))
                          : m
                          ? ((m = !1), (i = !0))
                          : A(
                              e,
                              "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"
                            ),
                          (e.position += 1),
                          (a = r);
                      if (
                        ((e.line === s || e.lineIndent > t) &&
                          (U(e, t, 4, !0, i) &&
                            (m ? (p = e.result) : (f = e.result)),
                          m || (O(e, l, h, d, p, f, s, o), (d = p = f = null)),
                          I(e, !0, -1),
                          (a = e.input.charCodeAt(e.position))),
                        e.lineIndent > t && 0 !== a)
                      )
                        A(e, "bad indentation of a mapping entry");
                      else if (e.lineIndent < t) break;
                    }
                    return (
                      m && O(e, l, h, d, p, null),
                      v &&
                        ((e.tag = u),
                        (e.anchor = c),
                        (e.kind = "mapping"),
                        (e.result = l)),
                      v
                    );
                  })(e, f, p))) ||
              (function (e, t) {
                var n,
                  r,
                  i,
                  s,
                  o,
                  a,
                  u,
                  c,
                  l,
                  h,
                  d = !0,
                  p = e.tag,
                  f = e.anchor,
                  m = {};
                if (91 === (h = e.input.charCodeAt(e.position)))
                  (i = 93), (a = !1), (r = []);
                else {
                  if (123 !== h) return !1;
                  (i = 125), (a = !0), (r = {});
                }
                for (
                  null !== e.anchor && (e.anchorMap[e.anchor] = r),
                    h = e.input.charCodeAt(++e.position);
                  0 !== h;

                ) {
                  if ((I(e, !0, t), (h = e.input.charCodeAt(e.position)) === i))
                    return (
                      e.position++,
                      (e.tag = p),
                      (e.anchor = f),
                      (e.kind = a ? "mapping" : "sequence"),
                      (e.result = r),
                      !0
                    );
                  d || A(e, "missed comma between flow collection entries"),
                    (l = null),
                    (s = o = !1),
                    63 === h &&
                      y(e.input.charCodeAt(e.position + 1)) &&
                      ((s = o = !0), e.position++, I(e, !0, t)),
                    (n = e.line),
                    U(e, t, 1, !1, !0),
                    (c = e.tag),
                    (u = e.result),
                    I(e, !0, t),
                    (h = e.input.charCodeAt(e.position)),
                    (!o && e.line !== n) ||
                      58 !== h ||
                      ((s = !0),
                      (h = e.input.charCodeAt(++e.position)),
                      I(e, !0, t),
                      U(e, t, 1, !1, !0),
                      (l = e.result)),
                    a
                      ? O(e, r, m, c, u, l)
                      : s
                      ? r.push(O(e, null, m, c, u, l))
                      : r.push(u),
                    I(e, !0, t),
                    44 === (h = e.input.charCodeAt(e.position))
                      ? ((d = !0), (h = e.input.charCodeAt(++e.position)))
                      : (d = !1);
                }
                A(e, "unexpected end of the stream within a flow collection");
              })(e, p)
              ? (C = !0)
              : ((a &&
                  (function (e, t) {
                    var n,
                      i,
                      s,
                      o,
                      a,
                      u = 1,
                      c = !1,
                      l = !1,
                      h = t,
                      d = 0,
                      p = !1;
                    if (124 === (o = e.input.charCodeAt(e.position))) i = !1;
                    else {
                      if (62 !== o) return !1;
                      i = !0;
                    }
                    for (e.kind = "scalar", e.result = ""; 0 !== o; )
                      if (
                        43 === (o = e.input.charCodeAt(++e.position)) ||
                        45 === o
                      )
                        1 === u
                          ? (u = 43 === o ? 3 : 2)
                          : A(e, "repeat of a chomping mode identifier");
                      else {
                        if (
                          !((s = 48 <= (a = o) && a <= 57 ? a - 48 : -1) >= 0)
                        )
                          break;
                        0 === s
                          ? A(
                              e,
                              "bad explicit indentation width of a block scalar; it cannot be less than one"
                            )
                          : l
                          ? A(e, "repeat of an indentation width identifier")
                          : ((h = t + s - 1), (l = !0));
                      }
                    if (g(o)) {
                      do {
                        o = e.input.charCodeAt(++e.position);
                      } while (g(o));
                      if (35 === o)
                        do {
                          o = e.input.charCodeAt(++e.position);
                        } while (!m(o) && 0 !== o);
                    }
                    for (; 0 !== o; ) {
                      for (
                        N(e),
                          e.lineIndent = 0,
                          o = e.input.charCodeAt(e.position);
                        (!l || e.lineIndent < h) && 32 === o;

                      )
                        e.lineIndent++, (o = e.input.charCodeAt(++e.position));
                      if ((!l && e.lineIndent > h && (h = e.lineIndent), m(o)))
                        d++;
                      else {
                        if (e.lineIndent < h) {
                          3 === u
                            ? (e.result += r.repeat("\n", c ? 1 + d : d))
                            : 1 === u && c && (e.result += "\n");
                          break;
                        }
                        for (
                          i
                            ? g(o)
                              ? ((p = !0),
                                (e.result += r.repeat("\n", c ? 1 + d : d)))
                              : p
                              ? ((p = !1), (e.result += r.repeat("\n", d + 1)))
                              : 0 === d
                              ? c && (e.result += " ")
                              : (e.result += r.repeat("\n", d))
                            : (e.result += r.repeat("\n", c ? 1 + d : d)),
                            c = !0,
                            l = !0,
                            d = 0,
                            n = e.position;
                          !m(o) && 0 !== o;

                        )
                          o = e.input.charCodeAt(++e.position);
                        k(e, n, e.position, !1);
                      }
                    }
                    return !0;
                  })(e, p)) ||
                (function (e, t) {
                  var n, r, i;
                  if (39 !== (n = e.input.charCodeAt(e.position))) return !1;
                  for (
                    e.kind = "scalar",
                      e.result = "",
                      e.position++,
                      r = i = e.position;
                    0 !== (n = e.input.charCodeAt(e.position));

                  )
                    if (39 === n) {
                      if (
                        (k(e, r, e.position, !0),
                        39 !== (n = e.input.charCodeAt(++e.position)))
                      )
                        return !0;
                      (r = e.position), e.position++, (i = e.position);
                    } else
                      m(n)
                        ? (k(e, r, i, !0),
                          R(e, I(e, !1, t)),
                          (r = i = e.position))
                        : e.position === e.lineStart && P(e)
                        ? A(
                            e,
                            "unexpected end of the document within a single quoted scalar"
                          )
                        : (e.position++, (i = e.position));
                  A(
                    e,
                    "unexpected end of the stream within a single quoted scalar"
                  );
                })(e, p) ||
                (function (e, t) {
                  var n, r, i, s, o, a, u;
                  if (34 !== (a = e.input.charCodeAt(e.position))) return !1;
                  for (
                    e.kind = "scalar",
                      e.result = "",
                      e.position++,
                      n = r = e.position;
                    0 !== (a = e.input.charCodeAt(e.position));

                  ) {
                    if (34 === a)
                      return k(e, n, e.position, !0), e.position++, !0;
                    if (92 === a) {
                      if (
                        (k(e, n, e.position, !0),
                        m((a = e.input.charCodeAt(++e.position))))
                      )
                        I(e, !1, t);
                      else if (a < 256 && D[a])
                        (e.result += w[a]), e.position++;
                      else if (
                        (o =
                          120 === (u = a)
                            ? 2
                            : 117 === u
                            ? 4
                            : 85 === u
                            ? 8
                            : 0) > 0
                      ) {
                        for (i = o, s = 0; i > 0; i--)
                          (o = E((a = e.input.charCodeAt(++e.position)))) >= 0
                            ? (s = (s << 4) + o)
                            : A(e, "expected hexadecimal character");
                        (e.result += b(s)), e.position++;
                      } else A(e, "unknown escape sequence");
                      n = r = e.position;
                    } else
                      m(a)
                        ? (k(e, n, r, !0),
                          R(e, I(e, !1, t)),
                          (n = r = e.position))
                        : e.position === e.lineStart && P(e)
                        ? A(
                            e,
                            "unexpected end of the document within a double quoted scalar"
                          )
                        : (e.position++, (r = e.position));
                  }
                  A(
                    e,
                    "unexpected end of the stream within a double quoted scalar"
                  );
                })(e, p)
                  ? (C = !0)
                  : !(function (e) {
                      var t, n, r;
                      if (42 !== (r = e.input.charCodeAt(e.position)))
                        return !1;
                      for (
                        r = e.input.charCodeAt(++e.position), t = e.position;
                        0 !== r && !y(r) && !v(r);

                      )
                        r = e.input.charCodeAt(++e.position);
                      return (
                        e.position === t &&
                          A(
                            e,
                            "name of an alias node must contain at least one character"
                          ),
                        (n = e.input.slice(t, e.position)),
                        e.anchorMap.hasOwnProperty(n) ||
                          A(e, 'unidentified alias "' + n + '"'),
                        (e.result = e.anchorMap[n]),
                        I(e, !0, -1),
                        !0
                      );
                    })(e)
                  ? (function (e, t, n) {
                      var r,
                        i,
                        s,
                        o,
                        a,
                        u,
                        c,
                        l,
                        h = e.kind,
                        d = e.result;
                      if (
                        y((l = e.input.charCodeAt(e.position))) ||
                        v(l) ||
                        35 === l ||
                        38 === l ||
                        42 === l ||
                        33 === l ||
                        124 === l ||
                        62 === l ||
                        39 === l ||
                        34 === l ||
                        37 === l ||
                        64 === l ||
                        96 === l
                      )
                        return !1;
                      if (
                        (63 === l || 45 === l) &&
                        (y((r = e.input.charCodeAt(e.position + 1))) ||
                          (n && v(r)))
                      )
                        return !1;
                      for (
                        e.kind = "scalar",
                          e.result = "",
                          i = s = e.position,
                          o = !1;
                        0 !== l;

                      ) {
                        if (58 === l) {
                          if (
                            y((r = e.input.charCodeAt(e.position + 1))) ||
                            (n && v(r))
                          )
                            break;
                        } else if (35 === l) {
                          if (y(e.input.charCodeAt(e.position - 1))) break;
                        } else {
                          if (
                            (e.position === e.lineStart && P(e)) ||
                            (n && v(l))
                          )
                            break;
                          if (m(l)) {
                            if (
                              ((a = e.line),
                              (u = e.lineStart),
                              (c = e.lineIndent),
                              I(e, !1, -1),
                              e.lineIndent >= t)
                            ) {
                              (o = !0), (l = e.input.charCodeAt(e.position));
                              continue;
                            }
                            (e.position = s),
                              (e.line = a),
                              (e.lineStart = u),
                              (e.lineIndent = c);
                            break;
                          }
                        }
                        o &&
                          (k(e, i, s, !1),
                          R(e, e.line - a),
                          (i = s = e.position),
                          (o = !1)),
                          g(l) || (s = e.position + 1),
                          (l = e.input.charCodeAt(++e.position));
                      }
                      return (
                        k(e, i, s, !1),
                        !!e.result || ((e.kind = h), (e.result = d), !1)
                      );
                    })(e, p, 1 === n) &&
                    ((C = !0), null === e.tag && (e.tag = "?"))
                  : ((C = !0),
                    (null === e.tag && null === e.anchor) ||
                      A(e, "alias node should not have any properties")),
                null !== e.anchor && (e.anchorMap[e.anchor] = e.result))
            : 0 === x && (C = c && L(e, f))),
        null !== e.tag && "!" !== e.tag)
      )
        if ("?" === e.tag) {
          for (
            null !== e.result &&
              "scalar" !== e.kind &&
              A(
                e,
                'unacceptable node kind for !<?> tag; it should be "scalar", not "' +
                  e.kind +
                  '"'
              ),
              l = 0,
              h = e.implicitTypes.length;
            l < h;
            l += 1
          )
            if ((d = e.implicitTypes[l]).resolve(e.result)) {
              (e.result = d.construct(e.result)),
                (e.tag = d.tag),
                null !== e.anchor && (e.anchorMap[e.anchor] = e.result);
              break;
            }
        } else
          u.call(e.typeMap[e.kind || "fallback"], e.tag)
            ? ((d = e.typeMap[e.kind || "fallback"][e.tag]),
              null !== e.result &&
                d.kind !== e.kind &&
                A(
                  e,
                  "unacceptable node kind for !<" +
                    e.tag +
                    '> tag; it should be "' +
                    d.kind +
                    '", not "' +
                    e.kind +
                    '"'
                ),
              d.resolve(e.result)
                ? ((e.result = d.construct(e.result)),
                  null !== e.anchor && (e.anchorMap[e.anchor] = e.result))
                : A(
                    e,
                    "cannot resolve a node with !<" + e.tag + "> explicit tag"
                  ))
            : A(e, "unknown tag !<" + e.tag + ">");
      return (
        null !== e.listener && e.listener("close", e),
        null !== e.tag || null !== e.anchor || C
      );
    }
    function $(e) {
      var t,
        n,
        r,
        i,
        s = e.position,
        o = !1;
      for (
        e.version = null,
          e.checkLineBreaks = e.legacy,
          e.tagMap = {},
          e.anchorMap = {};
        0 !== (i = e.input.charCodeAt(e.position)) &&
        (I(e, !0, -1),
        (i = e.input.charCodeAt(e.position)),
        !(e.lineIndent > 0 || 37 !== i));

      ) {
        for (
          o = !0, i = e.input.charCodeAt(++e.position), t = e.position;
          0 !== i && !y(i);

        )
          i = e.input.charCodeAt(++e.position);
        for (
          r = [],
            (n = e.input.slice(t, e.position)).length < 1 &&
              A(
                e,
                "directive name must not be less than one character in length"
              );
          0 !== i;

        ) {
          for (; g(i); ) i = e.input.charCodeAt(++e.position);
          if (35 === i) {
            do {
              i = e.input.charCodeAt(++e.position);
            } while (0 !== i && !m(i));
            break;
          }
          if (m(i)) break;
          for (t = e.position; 0 !== i && !y(i); )
            i = e.input.charCodeAt(++e.position);
          r.push(e.input.slice(t, e.position));
        }
        0 !== i && N(e),
          u.call(F, n)
            ? F[n](e, n, r)
            : j(e, 'unknown document directive "' + n + '"');
      }
      I(e, !0, -1),
        0 === e.lineIndent &&
        45 === e.input.charCodeAt(e.position) &&
        45 === e.input.charCodeAt(e.position + 1) &&
        45 === e.input.charCodeAt(e.position + 2)
          ? ((e.position += 3), I(e, !0, -1))
          : o && A(e, "directives end mark is expected"),
        U(e, e.lineIndent - 1, 4, !1, !0),
        I(e, !0, -1),
        e.checkLineBreaks &&
          l.test(e.input.slice(s, e.position)) &&
          j(e, "non-ASCII line breaks are interpreted as content"),
        e.documents.push(e.result),
        e.position === e.lineStart && P(e)
          ? 46 === e.input.charCodeAt(e.position) &&
            ((e.position += 3), I(e, !0, -1))
          : e.position < e.length - 1 &&
            A(e, "end of the stream or a document separator is expected");
    }
    function G(e, t) {
      (t = t || {}),
        0 !== (e = String(e)).length &&
          (10 !== e.charCodeAt(e.length - 1) &&
            13 !== e.charCodeAt(e.length - 1) &&
            (e += "\n"),
          65279 === e.charCodeAt(0) && (e = e.slice(1)));
      var n = new C(e, t),
        r = e.indexOf("\0");
      for (
        -1 !== r &&
          ((n.position = r), A(n, "null byte is not allowed in input")),
          n.input += "\0";
        32 === n.input.charCodeAt(n.position);

      )
        (n.lineIndent += 1), (n.position += 1);
      for (; n.position < n.length - 1; ) $(n);
      return n.documents;
    }
    function z(e, t, n) {
      null !== t &&
        "object" == typeof t &&
        void 0 === n &&
        ((n = t), (t = null));
      var r = G(e, n);
      if ("function" != typeof t) return r;
      for (var i = 0, s = r.length; i < s; i += 1) t(r[i]);
    }
    function q(e, t) {
      var n = G(e, t);
      if (0 !== n.length) {
        if (1 === n.length) return n[0];
        throw new i("expected a single document in the stream, but found more");
      }
    }
    (e.exports.loadAll = z),
      (e.exports.load = q),
      (e.exports.safeLoadAll = function (e, t, n) {
        return (
          "object" == typeof t &&
            null !== t &&
            void 0 === n &&
            ((n = t), (t = null)),
          z(e, t, r.extend({ schema: o }, n))
        );
      }),
      (e.exports.safeLoad = function (e, t) {
        return q(e, r.extend({ schema: o }, t));
      });
  },
  "./node_modules/js-yaml/lib/js-yaml/mark.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/common.js");
    function i(e, t, n, r, i) {
      (this.name = e),
        (this.buffer = t),
        (this.position = n),
        (this.line = r),
        (this.column = i);
    }
    (i.prototype.getSnippet = function (e, t) {
      var n, i, s, o, a;
      if (!this.buffer) return null;
      for (
        e = e || 4, t = t || 75, n = "", i = this.position;
        i > 0 && -1 === "\0\r\n\u2028\u2029".indexOf(this.buffer.charAt(i - 1));

      )
        if (((i -= 1), this.position - i > t / 2 - 1)) {
          (n = " ... "), (i += 5);
          break;
        }
      for (
        s = "", o = this.position;
        o < this.buffer.length &&
        -1 === "\0\r\n\u2028\u2029".indexOf(this.buffer.charAt(o));

      )
        if ((o += 1) - this.position > t / 2 - 1) {
          (s = " ... "), (o -= 5);
          break;
        }
      return (
        (a = this.buffer.slice(i, o)),
        r.repeat(" ", e) +
          n +
          a +
          s +
          "\n" +
          r.repeat(" ", e + this.position - i + n.length) +
          "^"
      );
    }),
      (i.prototype.toString = function (e) {
        var t,
          n = "";
        return (
          this.name && (n += 'in "' + this.name + '" '),
          (n += "at line " + (this.line + 1) + ", column " + (this.column + 1)),
          e || ((t = this.getSnippet()) && (n += ":\n" + t)),
          n
        );
      }),
      (e.exports = i);
  },
  "./node_modules/js-yaml/lib/js-yaml/schema.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/common.js"),
      i = n("./node_modules/js-yaml/lib/js-yaml/exception.js"),
      s = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    function o(e, t, n) {
      var r = [];
      return (
        e.include.forEach(function (e) {
          n = o(e, t, n);
        }),
        e[t].forEach(function (e) {
          n.forEach(function (t, n) {
            t.tag === e.tag && t.kind === e.kind && r.push(n);
          }),
            n.push(e);
        }),
        n.filter(function (e, t) {
          return -1 === r.indexOf(t);
        })
      );
    }
    function a(e) {
      (this.include = e.include || []),
        (this.implicit = e.implicit || []),
        (this.explicit = e.explicit || []),
        this.implicit.forEach(function (e) {
          if (e.loadKind && "scalar" !== e.loadKind)
            throw new i(
              "There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported."
            );
        }),
        (this.compiledImplicit = o(this, "implicit", [])),
        (this.compiledExplicit = o(this, "explicit", [])),
        (this.compiledTypeMap = (function () {
          var e,
            t,
            n = { scalar: {}, sequence: {}, mapping: {}, fallback: {} };
          function r(e) {
            n[e.kind][e.tag] = n.fallback[e.tag] = e;
          }
          for (e = 0, t = arguments.length; e < t; e += 1)
            arguments[e].forEach(r);
          return n;
        })(this.compiledImplicit, this.compiledExplicit));
    }
    (a.DEFAULT = null),
      (a.create = function () {
        var e, t;
        switch (arguments.length) {
          case 1:
            (e = a.DEFAULT), (t = arguments[0]);
            break;
          case 2:
            (e = arguments[0]), (t = arguments[1]);
            break;
          default:
            throw new i("Wrong number of arguments for Schema.create function");
        }
        if (
          ((e = r.toArray(e)),
          (t = r.toArray(t)),
          !e.every(function (e) {
            return e instanceof a;
          }))
        )
          throw new i(
            "Specified list of super schemas (or a single Schema object) contains a non-Schema object."
          );
        if (
          !t.every(function (e) {
            return e instanceof s;
          })
        )
          throw new i(
            "Specified list of YAML types (or a single Type object) contains a non-Type object."
          );
        return new a({ include: e, explicit: t });
      }),
      (e.exports = a);
  },
  "./node_modules/js-yaml/lib/js-yaml/schema/core.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/schema.js");
    e.exports = new r({
      include: [n("./node_modules/js-yaml/lib/js-yaml/schema/json.js")],
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/schema/default_full.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/schema.js");
    e.exports = r.DEFAULT = new r({
      include: [n("./node_modules/js-yaml/lib/js-yaml/schema/default_safe.js")],
      explicit: [
        n("./node_modules/js-yaml/lib/js-yaml/type/js/undefined.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/js/regexp.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/js/function.js"),
      ],
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/schema/default_safe.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/schema.js");
    e.exports = new r({
      include: [n("./node_modules/js-yaml/lib/js-yaml/schema/core.js")],
      implicit: [
        n("./node_modules/js-yaml/lib/js-yaml/type/timestamp.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/merge.js"),
      ],
      explicit: [
        n("./node_modules/js-yaml/lib/js-yaml/type/binary.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/omap.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/pairs.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/set.js"),
      ],
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/schema/failsafe.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/schema.js");
    e.exports = new r({
      explicit: [
        n("./node_modules/js-yaml/lib/js-yaml/type/str.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/seq.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/map.js"),
      ],
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/schema/json.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/schema.js");
    e.exports = new r({
      include: [n("./node_modules/js-yaml/lib/js-yaml/schema/failsafe.js")],
      implicit: [
        n("./node_modules/js-yaml/lib/js-yaml/type/null.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/bool.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/int.js"),
        n("./node_modules/js-yaml/lib/js-yaml/type/float.js"),
      ],
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/exception.js"),
      i = [
        "kind",
        "resolve",
        "construct",
        "instanceOf",
        "predicate",
        "represent",
        "defaultStyle",
        "styleAliases",
      ],
      s = ["scalar", "sequence", "mapping"];
    e.exports = function (e, t) {
      var n, o;
      if (
        ((t = t || {}),
        Object.keys(t).forEach(function (t) {
          if (-1 === i.indexOf(t))
            throw new r(
              'Unknown option "' +
                t +
                '" is met in definition of "' +
                e +
                '" YAML type.'
            );
        }),
        (this.tag = e),
        (this.kind = t.kind || null),
        (this.resolve =
          t.resolve ||
          function () {
            return !0;
          }),
        (this.construct =
          t.construct ||
          function (e) {
            return e;
          }),
        (this.instanceOf = t.instanceOf || null),
        (this.predicate = t.predicate || null),
        (this.represent = t.represent || null),
        (this.defaultStyle = t.defaultStyle || null),
        (this.styleAliases =
          ((n = t.styleAliases || null),
          (o = {}),
          null !== n &&
            Object.keys(n).forEach(function (e) {
              n[e].forEach(function (t) {
                o[String(t)] = e;
              });
            }),
          o)),
        -1 === s.indexOf(this.kind))
      )
        throw new r(
          'Unknown kind "' +
            this.kind +
            '" is specified for "' +
            e +
            '" YAML type.'
        );
    };
  },
  "./node_modules/js-yaml/lib/js-yaml/type/binary.js": function (e, t, n) {
    "use strict";
    var r;
    try {
      r = n("buffer").Buffer;
    } catch (e) {}
    var i = n("./node_modules/js-yaml/lib/js-yaml/type.js"),
      s =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
    e.exports = new i("tag:yaml.org,2002:binary", {
      kind: "scalar",
      resolve: function (e) {
        if (null === e) return !1;
        var t,
          n,
          r = 0,
          i = e.length,
          o = s;
        for (n = 0; n < i; n++)
          if (!((t = o.indexOf(e.charAt(n))) > 64)) {
            if (t < 0) return !1;
            r += 6;
          }
        return r % 8 == 0;
      },
      construct: function (e) {
        var t,
          n,
          i = e.replace(/[\r\n=]/g, ""),
          o = i.length,
          a = s,
          u = 0,
          c = [];
        for (t = 0; t < o; t++)
          t % 4 == 0 &&
            t &&
            (c.push((u >> 16) & 255), c.push((u >> 8) & 255), c.push(255 & u)),
            (u = (u << 6) | a.indexOf(i.charAt(t)));
        return (
          0 === (n = (o % 4) * 6)
            ? (c.push((u >> 16) & 255), c.push((u >> 8) & 255), c.push(255 & u))
            : 18 === n
            ? (c.push((u >> 10) & 255), c.push((u >> 2) & 255))
            : 12 === n && c.push((u >> 4) & 255),
          r ? (r.from ? r.from(c) : new r(c)) : c
        );
      },
      predicate: function (e) {
        return r && r.isBuffer(e);
      },
      represent: function (e) {
        var t,
          n,
          r = "",
          i = 0,
          o = e.length,
          a = s;
        for (t = 0; t < o; t++)
          t % 3 == 0 &&
            t &&
            ((r += a[(i >> 18) & 63]),
            (r += a[(i >> 12) & 63]),
            (r += a[(i >> 6) & 63]),
            (r += a[63 & i])),
            (i = (i << 8) + e[t]);
        return (
          0 === (n = o % 3)
            ? ((r += a[(i >> 18) & 63]),
              (r += a[(i >> 12) & 63]),
              (r += a[(i >> 6) & 63]),
              (r += a[63 & i]))
            : 2 === n
            ? ((r += a[(i >> 10) & 63]),
              (r += a[(i >> 4) & 63]),
              (r += a[(i << 2) & 63]),
              (r += a[64]))
            : 1 === n &&
              ((r += a[(i >> 2) & 63]),
              (r += a[(i << 4) & 63]),
              (r += a[64]),
              (r += a[64])),
          r
        );
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/bool.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:bool", {
      kind: "scalar",
      resolve: function (e) {
        if (null === e) return !1;
        var t = e.length;
        return (
          (4 === t && ("true" === e || "True" === e || "TRUE" === e)) ||
          (5 === t && ("false" === e || "False" === e || "FALSE" === e))
        );
      },
      construct: function (e) {
        return "true" === e || "True" === e || "TRUE" === e;
      },
      predicate: function (e) {
        return "[object Boolean]" === Object.prototype.toString.call(e);
      },
      represent: {
        lowercase: function (e) {
          return e ? "true" : "false";
        },
        uppercase: function (e) {
          return e ? "TRUE" : "FALSE";
        },
        camelcase: function (e) {
          return e ? "True" : "False";
        },
      },
      defaultStyle: "lowercase",
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/float.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/common.js"),
      i = n("./node_modules/js-yaml/lib/js-yaml/type.js"),
      s = new RegExp(
        "^(?:[-+]?(?:0|[1-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
      );
    var o = /^[-+]?[0-9]+e/;
    e.exports = new i("tag:yaml.org,2002:float", {
      kind: "scalar",
      resolve: function (e) {
        return null !== e && !(!s.test(e) || "_" === e[e.length - 1]);
      },
      construct: function (e) {
        var t, n, r, i;
        return (
          (n = "-" === (t = e.replace(/_/g, "").toLowerCase())[0] ? -1 : 1),
          (i = []),
          "+-".indexOf(t[0]) >= 0 && (t = t.slice(1)),
          ".inf" === t
            ? 1 === n
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY
            : ".nan" === t
            ? NaN
            : t.indexOf(":") >= 0
            ? (t.split(":").forEach(function (e) {
                i.unshift(parseFloat(e, 10));
              }),
              (t = 0),
              (r = 1),
              i.forEach(function (e) {
                (t += e * r), (r *= 60);
              }),
              n * t)
            : n * parseFloat(t, 10)
        );
      },
      predicate: function (e) {
        return (
          "[object Number]" === Object.prototype.toString.call(e) &&
          (e % 1 != 0 || r.isNegativeZero(e))
        );
      },
      represent: function (e, t) {
        var n;
        if (isNaN(e))
          switch (t) {
            case "lowercase":
              return ".nan";
            case "uppercase":
              return ".NAN";
            case "camelcase":
              return ".NaN";
          }
        else if (Number.POSITIVE_INFINITY === e)
          switch (t) {
            case "lowercase":
              return ".inf";
            case "uppercase":
              return ".INF";
            case "camelcase":
              return ".Inf";
          }
        else if (Number.NEGATIVE_INFINITY === e)
          switch (t) {
            case "lowercase":
              return "-.inf";
            case "uppercase":
              return "-.INF";
            case "camelcase":
              return "-.Inf";
          }
        else if (r.isNegativeZero(e)) return "-0.0";
        return (n = e.toString(10)), o.test(n) ? n.replace("e", ".e") : n;
      },
      defaultStyle: "lowercase",
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/int.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/common.js"),
      i = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    function s(e) {
      return 48 <= e && e <= 55;
    }
    function o(e) {
      return 48 <= e && e <= 57;
    }
    e.exports = new i("tag:yaml.org,2002:int", {
      kind: "scalar",
      resolve: function (e) {
        if (null === e) return !1;
        var t,
          n,
          r = e.length,
          i = 0,
          a = !1;
        if (!r) return !1;
        if ((("-" !== (t = e[i]) && "+" !== t) || (t = e[++i]), "0" === t)) {
          if (i + 1 === r) return !0;
          if ("b" === (t = e[++i])) {
            for (i++; i < r; i++)
              if ("_" !== (t = e[i])) {
                if ("0" !== t && "1" !== t) return !1;
                a = !0;
              }
            return a && "_" !== t;
          }
          if ("x" === t) {
            for (i++; i < r; i++)
              if ("_" !== (t = e[i])) {
                if (
                  !(
                    (48 <= (n = e.charCodeAt(i)) && n <= 57) ||
                    (65 <= n && n <= 70) ||
                    (97 <= n && n <= 102)
                  )
                )
                  return !1;
                a = !0;
              }
            return a && "_" !== t;
          }
          for (; i < r; i++)
            if ("_" !== (t = e[i])) {
              if (!s(e.charCodeAt(i))) return !1;
              a = !0;
            }
          return a && "_" !== t;
        }
        if ("_" === t) return !1;
        for (; i < r; i++)
          if ("_" !== (t = e[i])) {
            if (":" === t) break;
            if (!o(e.charCodeAt(i))) return !1;
            a = !0;
          }
        return (
          !(!a || "_" === t) &&
          (":" !== t || /^(:[0-5]?[0-9])+$/.test(e.slice(i)))
        );
      },
      construct: function (e) {
        var t,
          n,
          r = e,
          i = 1,
          s = [];
        return (
          -1 !== r.indexOf("_") && (r = r.replace(/_/g, "")),
          ("-" !== (t = r[0]) && "+" !== t) ||
            ("-" === t && (i = -1), (t = (r = r.slice(1))[0])),
          "0" === r
            ? 0
            : "0" === t
            ? "b" === r[1]
              ? i * parseInt(r.slice(2), 2)
              : "x" === r[1]
              ? i * parseInt(r, 16)
              : i * parseInt(r, 8)
            : -1 !== r.indexOf(":")
            ? (r.split(":").forEach(function (e) {
                s.unshift(parseInt(e, 10));
              }),
              (r = 0),
              (n = 1),
              s.forEach(function (e) {
                (r += e * n), (n *= 60);
              }),
              i * r)
            : i * parseInt(r, 10)
        );
      },
      predicate: function (e) {
        return (
          "[object Number]" === Object.prototype.toString.call(e) &&
          e % 1 == 0 &&
          !r.isNegativeZero(e)
        );
      },
      represent: {
        binary: function (e) {
          return e >= 0 ? "0b" + e.toString(2) : "-0b" + e.toString(2).slice(1);
        },
        octal: function (e) {
          return e >= 0 ? "0" + e.toString(8) : "-0" + e.toString(8).slice(1);
        },
        decimal: function (e) {
          return e.toString(10);
        },
        hexadecimal: function (e) {
          return e >= 0
            ? "0x" + e.toString(16).toUpperCase()
            : "-0x" + e.toString(16).toUpperCase().slice(1);
        },
      },
      defaultStyle: "decimal",
      styleAliases: {
        binary: [2, "bin"],
        octal: [8, "oct"],
        decimal: [10, "dec"],
        hexadecimal: [16, "hex"],
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/js/function.js": function (e, t, n) {
    "use strict";
    var r;
    try {
      r = n("./node_modules/esprima/dist/esprima.js");
    } catch (e) {
      "undefined" != typeof window && (r = window.esprima);
    }
    var i = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new i("tag:yaml.org,2002:js/function", {
      kind: "scalar",
      resolve: function (e) {
        if (null === e) return !1;
        try {
          var t = "(" + e + ")",
            n = r.parse(t, { range: !0 });
          return (
            "Program" === n.type &&
            1 === n.body.length &&
            "ExpressionStatement" === n.body[0].type &&
            ("ArrowFunctionExpression" === n.body[0].expression.type ||
              "FunctionExpression" === n.body[0].expression.type)
          );
        } catch (e) {
          return !1;
        }
      },
      construct: function (e) {
        var t,
          n = "(" + e + ")",
          i = r.parse(n, { range: !0 }),
          s = [];
        if (
          "Program" !== i.type ||
          1 !== i.body.length ||
          "ExpressionStatement" !== i.body[0].type ||
          ("ArrowFunctionExpression" !== i.body[0].expression.type &&
            "FunctionExpression" !== i.body[0].expression.type)
        )
          throw new Error("Failed to resolve function");
        return (
          i.body[0].expression.params.forEach(function (e) {
            s.push(e.name);
          }),
          (t = i.body[0].expression.body.range),
          "BlockStatement" === i.body[0].expression.body.type
            ? new Function(s, n.slice(t[0] + 1, t[1] - 1))
            : new Function(s, "return " + n.slice(t[0], t[1]))
        );
      },
      predicate: function (e) {
        return "[object Function]" === Object.prototype.toString.call(e);
      },
      represent: function (e) {
        return e.toString();
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/js/regexp.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:js/regexp", {
      kind: "scalar",
      resolve: function (e) {
        if (null === e) return !1;
        if (0 === e.length) return !1;
        var t = e,
          n = /\/([gim]*)$/.exec(e),
          r = "";
        if ("/" === t[0]) {
          if ((n && (r = n[1]), r.length > 3)) return !1;
          if ("/" !== t[t.length - r.length - 1]) return !1;
        }
        return !0;
      },
      construct: function (e) {
        var t = e,
          n = /\/([gim]*)$/.exec(e),
          r = "";
        return (
          "/" === t[0] &&
            (n && (r = n[1]), (t = t.slice(1, t.length - r.length - 1))),
          new RegExp(t, r)
        );
      },
      predicate: function (e) {
        return "[object RegExp]" === Object.prototype.toString.call(e);
      },
      represent: function (e) {
        var t = "/" + e.source + "/";
        return (
          e.global && (t += "g"),
          e.multiline && (t += "m"),
          e.ignoreCase && (t += "i"),
          t
        );
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/js/undefined.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:js/undefined", {
      kind: "scalar",
      resolve: function () {
        return !0;
      },
      construct: function () {},
      predicate: function (e) {
        return void 0 === e;
      },
      represent: function () {
        return "";
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/map.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:map", {
      kind: "mapping",
      construct: function (e) {
        return null !== e ? e : {};
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/merge.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:merge", {
      kind: "scalar",
      resolve: function (e) {
        return "<<" === e || null === e;
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/null.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:null", {
      kind: "scalar",
      resolve: function (e) {
        if (null === e) return !0;
        var t = e.length;
        return (
          (1 === t && "~" === e) ||
          (4 === t && ("null" === e || "Null" === e || "NULL" === e))
        );
      },
      construct: function () {
        return null;
      },
      predicate: function (e) {
        return null === e;
      },
      represent: {
        canonical: function () {
          return "~";
        },
        lowercase: function () {
          return "null";
        },
        uppercase: function () {
          return "NULL";
        },
        camelcase: function () {
          return "Null";
        },
      },
      defaultStyle: "lowercase",
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/omap.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js"),
      i = Object.prototype.hasOwnProperty,
      s = Object.prototype.toString;
    e.exports = new r("tag:yaml.org,2002:omap", {
      kind: "sequence",
      resolve: function (e) {
        if (null === e) return !0;
        var t,
          n,
          r,
          o,
          a,
          u = [],
          c = e;
        for (t = 0, n = c.length; t < n; t += 1) {
          if (((r = c[t]), (a = !1), "[object Object]" !== s.call(r)))
            return !1;
          for (o in r)
            if (i.call(r, o)) {
              if (a) return !1;
              a = !0;
            }
          if (!a) return !1;
          if (-1 !== u.indexOf(o)) return !1;
          u.push(o);
        }
        return !0;
      },
      construct: function (e) {
        return null !== e ? e : [];
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/pairs.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js"),
      i = Object.prototype.toString;
    e.exports = new r("tag:yaml.org,2002:pairs", {
      kind: "sequence",
      resolve: function (e) {
        if (null === e) return !0;
        var t,
          n,
          r,
          s,
          o,
          a = e;
        for (o = new Array(a.length), t = 0, n = a.length; t < n; t += 1) {
          if (((r = a[t]), "[object Object]" !== i.call(r))) return !1;
          if (1 !== (s = Object.keys(r)).length) return !1;
          o[t] = [s[0], r[s[0]]];
        }
        return !0;
      },
      construct: function (e) {
        if (null === e) return [];
        var t,
          n,
          r,
          i,
          s,
          o = e;
        for (s = new Array(o.length), t = 0, n = o.length; t < n; t += 1)
          (r = o[t]), (i = Object.keys(r)), (s[t] = [i[0], r[i[0]]]);
        return s;
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/seq.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:seq", {
      kind: "sequence",
      construct: function (e) {
        return null !== e ? e : [];
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/set.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js"),
      i = Object.prototype.hasOwnProperty;
    e.exports = new r("tag:yaml.org,2002:set", {
      kind: "mapping",
      resolve: function (e) {
        if (null === e) return !0;
        var t,
          n = e;
        for (t in n) if (i.call(n, t) && null !== n[t]) return !1;
        return !0;
      },
      construct: function (e) {
        return null !== e ? e : {};
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/str.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js");
    e.exports = new r("tag:yaml.org,2002:str", {
      kind: "scalar",
      construct: function (e) {
        return null !== e ? e : "";
      },
    });
  },
  "./node_modules/js-yaml/lib/js-yaml/type/timestamp.js": function (e, t, n) {
    "use strict";
    var r = n("./node_modules/js-yaml/lib/js-yaml/type.js"),
      i = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"),
      s = new RegExp(
        "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
      );
    e.exports = new r("tag:yaml.org,2002:timestamp", {
      kind: "scalar",
      resolve: function (e) {
        return null !== e && (null !== i.exec(e) || null !== s.exec(e));
      },
      construct: function (e) {
        var t,
          n,
          r,
          o,
          a,
          u,
          c,
          l,
          h = 0,
          d = null;
        if ((null === (t = i.exec(e)) && (t = s.exec(e)), null === t))
          throw new Error("Date resolve error");
        if (((n = +t[1]), (r = +t[2] - 1), (o = +t[3]), !t[4]))
          return new Date(Date.UTC(n, r, o));
        if (((a = +t[4]), (u = +t[5]), (c = +t[6]), t[7])) {
          for (h = t[7].slice(0, 3); h.length < 3; ) h += "0";
          h = +h;
        }
        return (
          t[9] &&
            ((d = 6e4 * (60 * +t[10] + +(t[11] || 0))),
            "-" === t[9] && (d = -d)),
          (l = new Date(Date.UTC(n, r, o, a, u, c, h))),
          d && l.setTime(l.getTime() - d),
          l
        );
      },
      instanceOf: Date,
      represent: function (e) {
        return e.toISOString();
      },
    });
  },
  "./node_modules/lazy-val/out/main.js": function (e, t, n) {
    "use strict";
    Object.defineProperty(t, "__esModule", { value: !0 }), (t.Lazy = void 0);
    t.Lazy = class {
      constructor(e) {
        (this._value = null), (this.creator = e);
      }
      get hasValue() {
        return null == this.creator;
      }
      get value() {
        if (null == this.creator) return this._value;
        const e = this.creator();
        return (this.value = e), e;
      }
      set value(e) {
        (this._value = e), (this.creator = null);
      }
    };
  },
  "./node_modules/lodash.isequal/index.js": function (e, t, n) {
    (function (e) {
      var n = "[object Arguments]",
        r = "[object Map]",
        i = "[object Object]",
        s = "[object Set]",
        o = /^\[object .+?Constructor\]$/,
        a = /^(?:0|[1-9]\d*)$/,
        u = {};
      (u["[object Float32Array]"] = u["[object Float64Array]"] = u[
        "[object Int8Array]"
      ] = u["[object Int16Array]"] = u["[object Int32Array]"] = u[
        "[object Uint8Array]"
      ] = u["[object Uint8ClampedArray]"] = u["[object Uint16Array]"] = u[
        "[object Uint32Array]"
      ] = !0),
        (u[n] = u["[object Array]"] = u["[object ArrayBuffer]"] = u[
          "[object Boolean]"
        ] = u["[object DataView]"] = u["[object Date]"] = u[
          "[object Error]"
        ] = u["[object Function]"] = u[r] = u["[object Number]"] = u[i] = u[
          "[object RegExp]"
        ] = u[s] = u["[object String]"] = u["[object WeakMap]"] = !1);
      var c =
          "object" == typeof global &&
          global &&
          global.Object === Object &&
          global,
        l = "object" == typeof self && self && self.Object === Object && self,
        h = c || l || Function("return this")(),
        d = t && !t.nodeType && t,
        p = d && "object" == typeof e && e && !e.nodeType && e,
        f = p && p.exports === d,
        m = f && c.process,
        g = (function () {
          try {
            return m && m.binding && m.binding("util");
          } catch (e) {}
        })(),
        y = g && g.isTypedArray;
      function v(e, t) {
        for (var n = -1, r = null == e ? 0 : e.length; ++n < r; )
          if (t(e[n], n, e)) return !0;
        return !1;
      }
      function E(e) {
        var t = -1,
          n = Array(e.size);
        return (
          e.forEach(function (e, r) {
            n[++t] = [r, e];
          }),
          n
        );
      }
      function x(e) {
        var t = -1,
          n = Array(e.size);
        return (
          e.forEach(function (e) {
            n[++t] = e;
          }),
          n
        );
      }
      var b,
        D,
        w,
        _ = Array.prototype,
        C = Function.prototype,
        S = Object.prototype,
        A = h["__core-js_shared__"],
        j = C.toString,
        F = S.hasOwnProperty,
        k = (b = /[^.]+$/.exec((A && A.keys && A.keys.IE_PROTO) || ""))
          ? "Symbol(src)_1." + b
          : "",
        T = S.toString,
        O = RegExp(
          "^" +
            j
              .call(F)
              .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
              .replace(
                /hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,
                "$1.*?"
              ) +
            "$"
        ),
        N = f ? h.Buffer : void 0,
        I = h.Symbol,
        P = h.Uint8Array,
        R = S.propertyIsEnumerable,
        L = _.splice,
        M = I ? I.toStringTag : void 0,
        B = Object.getOwnPropertySymbols,
        U = N ? N.isBuffer : void 0,
        $ =
          ((D = Object.keys),
          (w = Object),
          function (e) {
            return D(w(e));
          }),
        G = ge(h, "DataView"),
        z = ge(h, "Map"),
        q = ge(h, "Promise"),
        H = ge(h, "Set"),
        X = ge(h, "WeakMap"),
        J = ge(Object, "create"),
        W = xe(G),
        V = xe(z),
        Y = xe(q),
        K = xe(H),
        Q = xe(X),
        Z = I ? I.prototype : void 0,
        ee = Z ? Z.valueOf : void 0;
      function te(e) {
        var t = -1,
          n = null == e ? 0 : e.length;
        for (this.clear(); ++t < n; ) {
          var r = e[t];
          this.set(r[0], r[1]);
        }
      }
      function ne(e) {
        var t = -1,
          n = null == e ? 0 : e.length;
        for (this.clear(); ++t < n; ) {
          var r = e[t];
          this.set(r[0], r[1]);
        }
      }
      function re(e) {
        var t = -1,
          n = null == e ? 0 : e.length;
        for (this.clear(); ++t < n; ) {
          var r = e[t];
          this.set(r[0], r[1]);
        }
      }
      function ie(e) {
        var t = -1,
          n = null == e ? 0 : e.length;
        for (this.__data__ = new re(); ++t < n; ) this.add(e[t]);
      }
      function se(e) {
        var t = (this.__data__ = new ne(e));
        this.size = t.size;
      }
      function oe(e, t) {
        var n = we(e),
          r = !n && De(e),
          i = !n && !r && _e(e),
          s = !n && !r && !i && Fe(e),
          o = n || r || i || s,
          a = o
            ? (function (e, t) {
                for (var n = -1, r = Array(e); ++n < e; ) r[n] = t(n);
                return r;
              })(e.length, String)
            : [],
          u = a.length;
        for (var c in e)
          (!t && !F.call(e, c)) ||
            (o &&
              ("length" == c ||
                (i && ("offset" == c || "parent" == c)) ||
                (s &&
                  ("buffer" == c || "byteLength" == c || "byteOffset" == c)) ||
                Ee(c, u))) ||
            a.push(c);
        return a;
      }
      function ae(e, t) {
        for (var n = e.length; n--; ) if (be(e[n][0], t)) return n;
        return -1;
      }
      function ue(e) {
        return null == e
          ? void 0 === e
            ? "[object Undefined]"
            : "[object Null]"
          : M && M in Object(e)
          ? (function (e) {
              var t = F.call(e, M),
                n = e[M];
              try {
                e[M] = void 0;
                var r = !0;
              } catch (e) {}
              var i = T.call(e);
              r && (t ? (e[M] = n) : delete e[M]);
              return i;
            })(e)
          : (function (e) {
              return T.call(e);
            })(e);
      }
      function ce(e) {
        return je(e) && ue(e) == n;
      }
      function le(e, t, o, a, u) {
        return (
          e === t ||
          (null == e || null == t || (!je(e) && !je(t))
            ? e != e && t != t
            : (function (e, t, o, a, u, c) {
                var l = we(e),
                  h = we(t),
                  d = l ? "[object Array]" : ve(e),
                  p = h ? "[object Array]" : ve(t),
                  f = (d = d == n ? i : d) == i,
                  m = (p = p == n ? i : p) == i,
                  g = d == p;
                if (g && _e(e)) {
                  if (!_e(t)) return !1;
                  (l = !0), (f = !1);
                }
                if (g && !f)
                  return (
                    c || (c = new se()),
                    l || Fe(e)
                      ? pe(e, t, o, a, u, c)
                      : (function (e, t, n, i, o, a, u) {
                          switch (n) {
                            case "[object DataView]":
                              if (
                                e.byteLength != t.byteLength ||
                                e.byteOffset != t.byteOffset
                              )
                                return !1;
                              (e = e.buffer), (t = t.buffer);
                            case "[object ArrayBuffer]":
                              return !(
                                e.byteLength != t.byteLength ||
                                !a(new P(e), new P(t))
                              );
                            case "[object Boolean]":
                            case "[object Date]":
                            case "[object Number]":
                              return be(+e, +t);
                            case "[object Error]":
                              return e.name == t.name && e.message == t.message;
                            case "[object RegExp]":
                            case "[object String]":
                              return e == t + "";
                            case r:
                              var c = E;
                            case s:
                              var l = 1 & i;
                              if ((c || (c = x), e.size != t.size && !l))
                                return !1;
                              var h = u.get(e);
                              if (h) return h == t;
                              (i |= 2), u.set(e, t);
                              var d = pe(c(e), c(t), i, o, a, u);
                              return u.delete(e), d;
                            case "[object Symbol]":
                              if (ee) return ee.call(e) == ee.call(t);
                          }
                          return !1;
                        })(e, t, d, o, a, u, c)
                  );
                if (!(1 & o)) {
                  var y = f && F.call(e, "__wrapped__"),
                    v = m && F.call(t, "__wrapped__");
                  if (y || v) {
                    var b = y ? e.value() : e,
                      D = v ? t.value() : t;
                    return c || (c = new se()), u(b, D, o, a, c);
                  }
                }
                if (!g) return !1;
                return (
                  c || (c = new se()),
                  (function (e, t, n, r, i, s) {
                    var o = 1 & n,
                      a = fe(e),
                      u = a.length,
                      c = fe(t).length;
                    if (u != c && !o) return !1;
                    var l = u;
                    for (; l--; ) {
                      var h = a[l];
                      if (!(o ? h in t : F.call(t, h))) return !1;
                    }
                    var d = s.get(e);
                    if (d && s.get(t)) return d == t;
                    var p = !0;
                    s.set(e, t), s.set(t, e);
                    var f = o;
                    for (; ++l < u; ) {
                      h = a[l];
                      var m = e[h],
                        g = t[h];
                      if (r)
                        var y = o ? r(g, m, h, t, e, s) : r(m, g, h, e, t, s);
                      if (!(void 0 === y ? m === g || i(m, g, n, r, s) : y)) {
                        p = !1;
                        break;
                      }
                      f || (f = "constructor" == h);
                    }
                    if (p && !f) {
                      var v = e.constructor,
                        E = t.constructor;
                      v == E ||
                        !("constructor" in e) ||
                        !("constructor" in t) ||
                        ("function" == typeof v &&
                          v instanceof v &&
                          "function" == typeof E &&
                          E instanceof E) ||
                        (p = !1);
                    }
                    return s.delete(e), s.delete(t), p;
                  })(e, t, o, a, u, c)
                );
              })(e, t, o, a, le, u))
        );
      }
      function he(e) {
        return (
          !(
            !Ae(e) ||
            (function (e) {
              return !!k && k in e;
            })(e)
          ) && (Ce(e) ? O : o).test(xe(e))
        );
      }
      function de(e) {
        if (
          ((n = (t = e) && t.constructor),
          (r = ("function" == typeof n && n.prototype) || S),
          t !== r)
        )
          return $(e);
        var t,
          n,
          r,
          i = [];
        for (var s in Object(e))
          F.call(e, s) && "constructor" != s && i.push(s);
        return i;
      }
      function pe(e, t, n, r, i, s) {
        var o = 1 & n,
          a = e.length,
          u = t.length;
        if (a != u && !(o && u > a)) return !1;
        var c = s.get(e);
        if (c && s.get(t)) return c == t;
        var l = -1,
          h = !0,
          d = 2 & n ? new ie() : void 0;
        for (s.set(e, t), s.set(t, e); ++l < a; ) {
          var p = e[l],
            f = t[l];
          if (r) var m = o ? r(f, p, l, t, e, s) : r(p, f, l, e, t, s);
          if (void 0 !== m) {
            if (m) continue;
            h = !1;
            break;
          }
          if (d) {
            if (
              !v(t, function (e, t) {
                if (((o = t), !d.has(o) && (p === e || i(p, e, n, r, s))))
                  return d.push(t);
                var o;
              })
            ) {
              h = !1;
              break;
            }
          } else if (p !== f && !i(p, f, n, r, s)) {
            h = !1;
            break;
          }
        }
        return s.delete(e), s.delete(t), h;
      }
      function fe(e) {
        return (function (e, t, n) {
          var r = t(e);
          return we(e)
            ? r
            : (function (e, t) {
                for (var n = -1, r = t.length, i = e.length; ++n < r; )
                  e[i + n] = t[n];
                return e;
              })(r, n(e));
        })(e, ke, ye);
      }
      function me(e, t) {
        var n,
          r,
          i = e.__data__;
        return (
          "string" == (r = typeof (n = t)) ||
          "number" == r ||
          "symbol" == r ||
          "boolean" == r
            ? "__proto__" !== n
            : null === n
        )
          ? i["string" == typeof t ? "string" : "hash"]
          : i.map;
      }
      function ge(e, t) {
        var n = (function (e, t) {
          return null == e ? void 0 : e[t];
        })(e, t);
        return he(n) ? n : void 0;
      }
      (te.prototype.clear = function () {
        (this.__data__ = J ? J(null) : {}), (this.size = 0);
      }),
        (te.prototype.delete = function (e) {
          var t = this.has(e) && delete this.__data__[e];
          return (this.size -= t ? 1 : 0), t;
        }),
        (te.prototype.get = function (e) {
          var t = this.__data__;
          if (J) {
            var n = t[e];
            return "__lodash_hash_undefined__" === n ? void 0 : n;
          }
          return F.call(t, e) ? t[e] : void 0;
        }),
        (te.prototype.has = function (e) {
          var t = this.__data__;
          return J ? void 0 !== t[e] : F.call(t, e);
        }),
        (te.prototype.set = function (e, t) {
          var n = this.__data__;
          return (
            (this.size += this.has(e) ? 0 : 1),
            (n[e] = J && void 0 === t ? "__lodash_hash_undefined__" : t),
            this
          );
        }),
        (ne.prototype.clear = function () {
          (this.__data__ = []), (this.size = 0);
        }),
        (ne.prototype.delete = function (e) {
          var t = this.__data__,
            n = ae(t, e);
          return (
            !(n < 0) &&
            (n == t.length - 1 ? t.pop() : L.call(t, n, 1), --this.size, !0)
          );
        }),
        (ne.prototype.get = function (e) {
          var t = this.__data__,
            n = ae(t, e);
          return n < 0 ? void 0 : t[n][1];
        }),
        (ne.prototype.has = function (e) {
          return ae(this.__data__, e) > -1;
        }),
        (ne.prototype.set = function (e, t) {
          var n = this.__data__,
            r = ae(n, e);
          return r < 0 ? (++this.size, n.push([e, t])) : (n[r][1] = t), this;
        }),
        (re.prototype.clear = function () {
          (this.size = 0),
            (this.__data__ = {
              hash: new te(),
              map: new (z || ne)(),
              string: new te(),
            });
        }),
        (re.prototype.delete = function (e) {
          var t = me(this, e).delete(e);
          return (this.size -= t ? 1 : 0), t;
        }),
        (re.prototype.get = function (e) {
          return me(this, e).get(e);
        }),
        (re.prototype.has = function (e) {
          return me(this, e).has(e);
        }),
        (re.prototype.set = function (e, t) {
          var n = me(this, e),
            r = n.size;
          return n.set(e, t), (this.size += n.size == r ? 0 : 1), this;
        }),
        (ie.prototype.add = ie.prototype.push = function (e) {
          return this.__data__.set(e, "__lodash_hash_undefined__"), this;
        }),
        (ie.prototype.has = function (e) {
          return this.__data__.has(e);
        }),
        (se.prototype.clear = function () {
          (this.__data__ = new ne()), (this.size = 0);
        }),
        (se.prototype.delete = function (e) {
          var t = this.__data__,
            n = t.delete(e);
          return (this.size = t.size), n;
        }),
        (se.prototype.get = function (e) {
          return this.__data__.get(e);
        }),
        (se.prototype.has = function (e) {
          return this.__data__.has(e);
        }),
        (se.prototype.set = function (e, t) {
          var n = this.__data__;
          if (n instanceof ne) {
            var r = n.__data__;
            if (!z || r.length < 199)
              return r.push([e, t]), (this.size = ++n.size), this;
            n = this.__data__ = new re(r);
          }
          return n.set(e, t), (this.size = n.size), this;
        });
      var ye = B
          ? function (e) {
              return null == e
                ? []
                : ((e = Object(e)),
                  (function (e, t) {
                    for (
                      var n = -1, r = null == e ? 0 : e.length, i = 0, s = [];
                      ++n < r;

                    ) {
                      var o = e[n];
                      t(o, n, e) && (s[i++] = o);
                    }
                    return s;
                  })(B(e), function (t) {
                    return R.call(e, t);
                  }));
            }
          : function () {
              return [];
            },
        ve = ue;
      function Ee(e, t) {
        return (
          !!(t = null == t ? 9007199254740991 : t) &&
          ("number" == typeof e || a.test(e)) &&
          e > -1 &&
          e % 1 == 0 &&
          e < t
        );
      }
      function xe(e) {
        if (null != e) {
          try {
            return j.call(e);
          } catch (e) {}
          try {
            return e + "";
          } catch (e) {}
        }
        return "";
      }
      function be(e, t) {
        return e === t || (e != e && t != t);
      }
      ((G && "[object DataView]" != ve(new G(new ArrayBuffer(1)))) ||
        (z && ve(new z()) != r) ||
        (q && "[object Promise]" != ve(q.resolve())) ||
        (H && ve(new H()) != s) ||
        (X && "[object WeakMap]" != ve(new X()))) &&
        (ve = function (e) {
          var t = ue(e),
            n = t == i ? e.constructor : void 0,
            o = n ? xe(n) : "";
          if (o)
            switch (o) {
              case W:
                return "[object DataView]";
              case V:
                return r;
              case Y:
                return "[object Promise]";
              case K:
                return s;
              case Q:
                return "[object WeakMap]";
            }
          return t;
        });
      var De = ce(
          (function () {
            return arguments;
          })()
        )
          ? ce
          : function (e) {
              return je(e) && F.call(e, "callee") && !R.call(e, "callee");
            },
        we = Array.isArray;
      var _e =
        U ||
        function () {
          return !1;
        };
      function Ce(e) {
        if (!Ae(e)) return !1;
        var t = ue(e);
        return (
          "[object Function]" == t ||
          "[object GeneratorFunction]" == t ||
          "[object AsyncFunction]" == t ||
          "[object Proxy]" == t
        );
      }
      function Se(e) {
        return (
          "number" == typeof e && e > -1 && e % 1 == 0 && e <= 9007199254740991
        );
      }
      function Ae(e) {
        var t = typeof e;
        return null != e && ("object" == t || "function" == t);
      }
      function je(e) {
        return null != e && "object" == typeof e;
      }
      var Fe = y
        ? (function (e) {
            return function (t) {
              return e(t);
            };
          })(y)
        : function (e) {
            return je(e) && Se(e.length) && !!u[ue(e)];
          };
      function ke(e) {
        return null != (t = e) && Se(t.length) && !Ce(t) ? oe(e) : de(e);
        var t;
      }
      e.exports = function (e, t) {
        return le(e, t);
      };
    }.call(this, n("./node_modules/webpack/buildin/module.js")(e)));
  },
  "./node_modules/minimatch/minimatch.js": function (e, t, n) {
    (e.exports = l), (l.Minimatch = h);
    var r = { sep: "/" };
    try {
      r = n("path");
    } catch (e) {}
    var i = (l.GLOBSTAR = h.GLOBSTAR = {}),
      s = n("./node_modules/brace-expansion/index.js"),
      o = {
        "!": { open: "(?:(?!(?:", close: "))[^/]*?)" },
        "?": { open: "(?:", close: ")?" },
        "+": { open: "(?:", close: ")+" },
        "*": { open: "(?:", close: ")*" },
        "@": { open: "(?:", close: ")" },
      },
      a = "().*{}+?[]^$\\!".split("").reduce(function (e, t) {
        return (e[t] = !0), e;
      }, {});
    var u = /\/+/;
    function c(e, t) {
      (e = e || {}), (t = t || {});
      var n = {};
      return (
        Object.keys(t).forEach(function (e) {
          n[e] = t[e];
        }),
        Object.keys(e).forEach(function (t) {
          n[t] = e[t];
        }),
        n
      );
    }
    function l(e, t, n) {
      if ("string" != typeof t)
        throw new TypeError("glob pattern string required");
      return (
        n || (n = {}),
        !(!n.nocomment && "#" === t.charAt(0)) &&
          ("" === t.trim() ? "" === e : new h(t, n).match(e))
      );
    }
    function h(e, t) {
      if (!(this instanceof h)) return new h(e, t);
      if ("string" != typeof e)
        throw new TypeError("glob pattern string required");
      t || (t = {}),
        (e = e.trim()),
        "/" !== r.sep && (e = e.split(r.sep).join("/")),
        (this.options = t),
        (this.set = []),
        (this.pattern = e),
        (this.regexp = null),
        (this.negate = !1),
        (this.comment = !1),
        (this.empty = !1),
        this.make();
    }
    function d(e, t) {
      if (
        (t || (t = this instanceof h ? this.options : {}),
        void 0 === (e = void 0 === e ? this.pattern : e))
      )
        throw new TypeError("undefined pattern");
      return t.nobrace || !e.match(/\{.*\}/) ? [e] : s(e);
    }
    (l.filter = function (e, t) {
      return (
        (t = t || {}),
        function (n, r, i) {
          return l(n, e, t);
        }
      );
    }),
      (l.defaults = function (e) {
        if (!e || !Object.keys(e).length) return l;
        var t = l,
          n = function (n, r, i) {
            return t.minimatch(n, r, c(e, i));
          };
        return (
          (n.Minimatch = function (n, r) {
            return new t.Minimatch(n, c(e, r));
          }),
          n
        );
      }),
      (h.defaults = function (e) {
        return e && Object.keys(e).length ? l.defaults(e).Minimatch : h;
      }),
      (h.prototype.debug = function () {}),
      (h.prototype.make = function () {
        if (this._made) return;
        var e = this.pattern,
          t = this.options;
        if (!t.nocomment && "#" === e.charAt(0))
          return void (this.comment = !0);
        if (!e) return void (this.empty = !0);
        this.parseNegate();
        var n = (this.globSet = this.braceExpand());
        t.debug && (this.debug = console.error);
        this.debug(this.pattern, n),
          (n = this.globParts = n.map(function (e) {
            return e.split(u);
          })),
          this.debug(this.pattern, n),
          (n = n.map(function (e, t, n) {
            return e.map(this.parse, this);
          }, this)),
          this.debug(this.pattern, n),
          (n = n.filter(function (e) {
            return -1 === e.indexOf(!1);
          })),
          this.debug(this.pattern, n),
          (this.set = n);
      }),
      (h.prototype.parseNegate = function () {
        var e = this.pattern,
          t = !1,
          n = this.options,
          r = 0;
        if (n.nonegate) return;
        for (var i = 0, s = e.length; i < s && "!" === e.charAt(i); i++)
          (t = !t), r++;
        r && (this.pattern = e.substr(r));
        this.negate = t;
      }),
      (l.braceExpand = function (e, t) {
        return d(e, t);
      }),
      (h.prototype.braceExpand = d),
      (h.prototype.parse = function (e, t) {
        if (e.length > 65536) throw new TypeError("pattern is too long");
        var n = this.options;
        if (!n.noglobstar && "**" === e) return i;
        if ("" === e) return "";
        var r,
          s = "",
          u = !!n.nocase,
          c = !1,
          l = [],
          h = [],
          d = !1,
          f = -1,
          m = -1,
          g =
            "." === e.charAt(0)
              ? ""
              : n.dot
              ? "(?!(?:^|\\/)\\.{1,2}(?:$|\\/))"
              : "(?!\\.)",
          y = this;
        function v() {
          if (r) {
            switch (r) {
              case "*":
                (s += "[^/]*?"), (u = !0);
                break;
              case "?":
                (s += "[^/]"), (u = !0);
                break;
              default:
                s += "\\" + r;
            }
            y.debug("clearStateChar %j %j", r, s), (r = !1);
          }
        }
        for (var E, x = 0, b = e.length; x < b && (E = e.charAt(x)); x++)
          if ((this.debug("%s\t%s %s %j", e, x, s, E), c && a[E]))
            (s += "\\" + E), (c = !1);
          else
            switch (E) {
              case "/":
                return !1;
              case "\\":
                v(), (c = !0);
                continue;
              case "?":
              case "*":
              case "+":
              case "@":
              case "!":
                if ((this.debug("%s\t%s %s %j <-- stateChar", e, x, s, E), d)) {
                  this.debug("  in class"),
                    "!" === E && x === m + 1 && (E = "^"),
                    (s += E);
                  continue;
                }
                y.debug("call clearStateChar %j", r),
                  v(),
                  (r = E),
                  n.noext && v();
                continue;
              case "(":
                if (d) {
                  s += "(";
                  continue;
                }
                if (!r) {
                  s += "\\(";
                  continue;
                }
                l.push({
                  type: r,
                  start: x - 1,
                  reStart: s.length,
                  open: o[r].open,
                  close: o[r].close,
                }),
                  (s += "!" === r ? "(?:(?!(?:" : "(?:"),
                  this.debug("plType %j %j", r, s),
                  (r = !1);
                continue;
              case ")":
                if (d || !l.length) {
                  s += "\\)";
                  continue;
                }
                v(), (u = !0);
                var D = l.pop();
                (s += D.close),
                  "!" === D.type && h.push(D),
                  (D.reEnd = s.length);
                continue;
              case "|":
                if (d || !l.length || c) {
                  (s += "\\|"), (c = !1);
                  continue;
                }
                v(), (s += "|");
                continue;
              case "[":
                if ((v(), d)) {
                  s += "\\" + E;
                  continue;
                }
                (d = !0), (m = x), (f = s.length), (s += E);
                continue;
              case "]":
                if (x === m + 1 || !d) {
                  (s += "\\" + E), (c = !1);
                  continue;
                }
                if (d) {
                  var w = e.substring(m + 1, x);
                  try {
                    RegExp("[" + w + "]");
                  } catch (e) {
                    var _ = this.parse(w, p);
                    (s = s.substr(0, f) + "\\[" + _[0] + "\\]"),
                      (u = u || _[1]),
                      (d = !1);
                    continue;
                  }
                }
                (u = !0), (d = !1), (s += E);
                continue;
              default:
                v(),
                  c ? (c = !1) : !a[E] || ("^" === E && d) || (s += "\\"),
                  (s += E);
            }
        d &&
          ((w = e.substr(m + 1)),
          (_ = this.parse(w, p)),
          (s = s.substr(0, f) + "\\[" + _[0]),
          (u = u || _[1]));
        for (D = l.pop(); D; D = l.pop()) {
          var C = s.slice(D.reStart + D.open.length);
          this.debug("setting tail", s, D),
            (C = C.replace(/((?:\\{2}){0,64})(\\?)\|/g, function (e, t, n) {
              return n || (n = "\\"), t + t + n + "|";
            })),
            this.debug("tail=%j\n   %s", C, C, D, s);
          var S =
            "*" === D.type ? "[^/]*?" : "?" === D.type ? "[^/]" : "\\" + D.type;
          (u = !0), (s = s.slice(0, D.reStart) + S + "\\(" + C);
        }
        v(), c && (s += "\\\\");
        var A = !1;
        switch (s.charAt(0)) {
          case ".":
          case "[":
          case "(":
            A = !0;
        }
        for (var j = h.length - 1; j > -1; j--) {
          var F = h[j],
            k = s.slice(0, F.reStart),
            T = s.slice(F.reStart, F.reEnd - 8),
            O = s.slice(F.reEnd - 8, F.reEnd),
            N = s.slice(F.reEnd);
          O += N;
          var I = k.split("(").length - 1,
            P = N;
          for (x = 0; x < I; x++) P = P.replace(/\)[+*?]?/, "");
          var R = "";
          "" === (N = P) && t !== p && (R = "$"), (s = k + T + N + R + O);
        }
        "" !== s && u && (s = "(?=.)" + s);
        A && (s = g + s);
        if (t === p) return [s, u];
        if (!u)
          return (function (e) {
            return e.replace(/\\(.)/g, "$1");
          })(e);
        var L = n.nocase ? "i" : "";
        try {
          var M = new RegExp("^" + s + "$", L);
        } catch (e) {
          return new RegExp("$.");
        }
        return (M._glob = e), (M._src = s), M;
      });
    var p = {};
    (l.makeRe = function (e, t) {
      return new h(e, t || {}).makeRe();
    }),
      (h.prototype.makeRe = function () {
        if (this.regexp || !1 === this.regexp) return this.regexp;
        var e = this.set;
        if (!e.length) return (this.regexp = !1), this.regexp;
        var t = this.options,
          n = t.noglobstar
            ? "[^/]*?"
            : t.dot
            ? "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?"
            : "(?:(?!(?:\\/|^)\\.).)*?",
          r = t.nocase ? "i" : "",
          s = e
            .map(function (e) {
              return e
                .map(function (e) {
                  return e === i
                    ? n
                    : "string" == typeof e
                    ? (function (e) {
                        return e.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
                      })(e)
                    : e._src;
                })
                .join("\\/");
            })
            .join("|");
        (s = "^(?:" + s + ")$"), this.negate && (s = "^(?!" + s + ").*$");
        try {
          this.regexp = new RegExp(s, r);
        } catch (e) {
          this.regexp = !1;
        }
        return this.regexp;
      }),
      (l.match = function (e, t, n) {
        var r = new h(t, (n = n || {}));
        return (
          (e = e.filter(function (e) {
            return r.match(e);
          })),
          r.options.nonull && !e.length && e.push(t),
          e
        );
      }),
      (h.prototype.match = function (e, t) {
        if ((this.debug("match", e, this.pattern), this.comment)) return !1;
        if (this.empty) return "" === e;
        if ("/" === e && t) return !0;
        var n = this.options;
        "/" !== r.sep && (e = e.split(r.sep).join("/"));
        (e = e.split(u)), this.debug(this.pattern, "split", e);
        var i,
          s,
          o = this.set;
        for (
          this.debug(this.pattern, "set", o), s = e.length - 1;
          s >= 0 && !(i = e[s]);
          s--
        );
        for (s = 0; s < o.length; s++) {
          var a = o[s],
            c = e;
          if (
            (n.matchBase && 1 === a.length && (c = [i]), this.matchOne(c, a, t))
          )
            return !!n.flipNegate || !this.negate;
        }
        return !n.flipNegate && this.negate;
      }),
      (h.prototype.matchOne = function (e, t, n) {
        var r = this.options;
        this.debug("matchOne", { this: this, file: e, pattern: t }),
          this.debug("matchOne", e.length, t.length);
        for (
          var s = 0, o = 0, a = e.length, u = t.length;
          s < a && o < u;
          s++, o++
        ) {
          this.debug("matchOne loop");
          var c,
            l = t[o],
            h = e[s];
          if ((this.debug(t, l, h), !1 === l)) return !1;
          if (l === i) {
            this.debug("GLOBSTAR", [t, l, h]);
            var d = s,
              p = o + 1;
            if (p === u) {
              for (this.debug("** at the end"); s < a; s++)
                if (
                  "." === e[s] ||
                  ".." === e[s] ||
                  (!r.dot && "." === e[s].charAt(0))
                )
                  return !1;
              return !0;
            }
            for (; d < a; ) {
              var f = e[d];
              if (
                (this.debug("\nglobstar while", e, d, t, p, f),
                this.matchOne(e.slice(d), t.slice(p), n))
              )
                return this.debug("globstar found match!", d, a, f), !0;
              if ("." === f || ".." === f || (!r.dot && "." === f.charAt(0))) {
                this.debug("dot detected!", e, d, t, p);
                break;
              }
              this.debug("globstar swallow a segment, and continue"), d++;
            }
            return !(
              !n ||
              (this.debug("\n>>> no match, partial?", e, d, t, p), d !== a)
            );
          }
          if (
            ("string" == typeof l
              ? ((c = r.nocase ? h.toLowerCase() === l.toLowerCase() : h === l),
                this.debug("string match", l, h, c))
              : ((c = h.match(l)), this.debug("pattern match", l, h, c)),
            !c)
          )
            return !1;
        }
        if (s === a && o === u) return !0;
        if (s === a) return n;
        if (o === u) return s === a - 1 && "" === e[s];
        throw new Error("wtf?");
      });
  },
  "./node_modules/once/once.js": function (e, t, n) {
    var r = n("./node_modules/wrappy/wrappy.js");
    function i(e) {
      var t = function () {
        return t.called
          ? t.value
          : ((t.called = !0), (t.value = e.apply(this, arguments)));
      };
      return (t.called = !1), t;
    }
    function s(e) {
      var t = function () {
          if (t.called) throw new Error(t.onceError);
          return (t.called = !0), (t.value = e.apply(this, arguments));
        },
        n = e.name || "Function wrapped with `once`";
      return (
        (t.onceError = n + " shouldn't be called more than once"),
        (t.called = !1),
        t
      );
    }
    (e.exports = r(i)),
      (e.exports.strict = r(s)),
      (i.proto = i(function () {
        Object.defineProperty(Function.prototype, "once", {
          value: function () {
            return i(this);
          },
          configurable: !0,
        }),
          Object.defineProperty(Function.prototype, "onceStrict", {
            value: function () {
              return s(this);
            },
            configurable: !0,
          });
      }));
  },
  "./node_modules/path-is-absolute/index.js": function (e, t, n) {
    "use strict";
    function r(e) {
      return "/" === e.charAt(0);
    }
    function i(e) {
      var t = /^([a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/.exec(
          e
        ),
        n = t[1] || "",
        r = Boolean(n && ":" !== n.charAt(1));
      return Boolean(t[2] || r);
    }
    (e.exports = "win32" === process.platform ? i : r),
      (e.exports.posix = r),
      (e.exports.win32 = i);
  },
  "./node_modules/sax/lib/sax.js": function (e, t, n) {
    !(function (e) {
      (e.parser = function (e, t) {
        return new i(e, t);
      }),
        (e.SAXParser = i),
        (e.SAXStream = o),
        (e.createStream = function (e, t) {
          return new o(e, t);
        }),
        (e.MAX_BUFFER_LENGTH = 65536);
      var t,
        r = [
          "comment",
          "sgmlDecl",
          "textNode",
          "tagName",
          "doctype",
          "procInstName",
          "procInstBody",
          "entity",
          "attribName",
          "attribValue",
          "cdata",
          "script",
        ];
      function i(t, n) {
        if (!(this instanceof i)) return new i(t, n);
        !(function (e) {
          for (var t = 0, n = r.length; t < n; t++) e[r[t]] = "";
        })(this),
          (this.q = this.c = ""),
          (this.bufferCheckPosition = e.MAX_BUFFER_LENGTH),
          (this.opt = n || {}),
          (this.opt.lowercase = this.opt.lowercase || this.opt.lowercasetags),
          (this.looseCase = this.opt.lowercase ? "toLowerCase" : "toUpperCase"),
          (this.tags = []),
          (this.closed = this.closedRoot = this.sawRoot = !1),
          (this.tag = this.error = null),
          (this.strict = !!t),
          (this.noscript = !(!t && !this.opt.noscript)),
          (this.state = b.BEGIN),
          (this.strictEntities = this.opt.strictEntities),
          (this.ENTITIES = this.strictEntities
            ? Object.create(e.XML_ENTITIES)
            : Object.create(e.ENTITIES)),
          (this.attribList = []),
          this.opt.xmlns && (this.ns = Object.create(u)),
          (this.trackPosition = !1 !== this.opt.position),
          this.trackPosition && (this.position = this.line = this.column = 0),
          w(this, "onready");
      }
      (e.EVENTS = [
        "text",
        "processinginstruction",
        "sgmldeclaration",
        "doctype",
        "comment",
        "opentagstart",
        "attribute",
        "opentag",
        "closetag",
        "opencdata",
        "cdata",
        "closecdata",
        "error",
        "end",
        "ready",
        "script",
        "opennamespace",
        "closenamespace",
      ]),
        Object.create ||
          (Object.create = function (e) {
            function t() {}
            return (t.prototype = e), new t();
          }),
        Object.keys ||
          (Object.keys = function (e) {
            var t = [];
            for (var n in e) e.hasOwnProperty(n) && t.push(n);
            return t;
          }),
        (i.prototype = {
          end: function () {
            j(this);
          },
          write: function (t) {
            if (this.error) throw this.error;
            if (this.closed)
              return A(
                this,
                "Cannot write after close. Assign an onready handler."
              );
            if (null === t) return j(this);
            "object" == typeof t && (t = t.toString());
            var n = 0,
              i = "";
            for (; (i = L(t, n++)), (this.c = i), i; )
              switch (
                (this.trackPosition &&
                  (this.position++,
                  "\n" === i
                    ? (this.line++, (this.column = 0))
                    : this.column++),
                this.state)
              ) {
                case b.BEGIN:
                  if (((this.state = b.BEGIN_WHITESPACE), "\ufeff" === i))
                    continue;
                  R(this, i);
                  continue;
                case b.BEGIN_WHITESPACE:
                  R(this, i);
                  continue;
                case b.TEXT:
                  if (this.sawRoot && !this.closedRoot) {
                    for (var s = n - 1; i && "<" !== i && "&" !== i; )
                      (i = L(t, n++)) &&
                        this.trackPosition &&
                        (this.position++,
                        "\n" === i
                          ? (this.line++, (this.column = 0))
                          : this.column++);
                    this.textNode += t.substring(s, n - 1);
                  }
                  "<" !== i || (this.sawRoot && this.closedRoot && !this.strict)
                    ? (p(i) ||
                        (this.sawRoot && !this.closedRoot) ||
                        F(this, "Text data outside of root node."),
                      "&" === i
                        ? (this.state = b.TEXT_ENTITY)
                        : (this.textNode += i))
                    : ((this.state = b.OPEN_WAKA),
                      (this.startTagPosition = this.position));
                  continue;
                case b.SCRIPT:
                  "<" === i
                    ? (this.state = b.SCRIPT_ENDING)
                    : (this.script += i);
                  continue;
                case b.SCRIPT_ENDING:
                  "/" === i
                    ? (this.state = b.CLOSE_TAG)
                    : ((this.script += "<" + i), (this.state = b.SCRIPT));
                  continue;
                case b.OPEN_WAKA:
                  if ("!" === i)
                    (this.state = b.SGML_DECL), (this.sgmlDecl = "");
                  else if (p(i));
                  else if (g(c, i))
                    (this.state = b.OPEN_TAG), (this.tagName = i);
                  else if ("/" === i)
                    (this.state = b.CLOSE_TAG), (this.tagName = "");
                  else if ("?" === i)
                    (this.state = b.PROC_INST),
                      (this.procInstName = this.procInstBody = "");
                  else {
                    if (
                      (F(this, "Unencoded <"),
                      this.startTagPosition + 1 < this.position)
                    ) {
                      var o = this.position - this.startTagPosition;
                      i = new Array(o).join(" ") + i;
                    }
                    (this.textNode += "<" + i), (this.state = b.TEXT);
                  }
                  continue;
                case b.SGML_DECL:
                  "[CDATA[" === (this.sgmlDecl + i).toUpperCase()
                    ? (_(this, "onopencdata"),
                      (this.state = b.CDATA),
                      (this.sgmlDecl = ""),
                      (this.cdata = ""))
                    : this.sgmlDecl + i === "--"
                    ? ((this.state = b.COMMENT),
                      (this.comment = ""),
                      (this.sgmlDecl = ""))
                    : "DOCTYPE" === (this.sgmlDecl + i).toUpperCase()
                    ? ((this.state = b.DOCTYPE),
                      (this.doctype || this.sawRoot) &&
                        F(this, "Inappropriately located doctype declaration"),
                      (this.doctype = ""),
                      (this.sgmlDecl = ""))
                    : ">" === i
                    ? (_(this, "onsgmldeclaration", this.sgmlDecl),
                      (this.sgmlDecl = ""),
                      (this.state = b.TEXT))
                    : f(i)
                    ? ((this.state = b.SGML_DECL_QUOTED), (this.sgmlDecl += i))
                    : (this.sgmlDecl += i);
                  continue;
                case b.SGML_DECL_QUOTED:
                  i === this.q && ((this.state = b.SGML_DECL), (this.q = "")),
                    (this.sgmlDecl += i);
                  continue;
                case b.DOCTYPE:
                  ">" === i
                    ? ((this.state = b.TEXT),
                      _(this, "ondoctype", this.doctype),
                      (this.doctype = !0))
                    : ((this.doctype += i),
                      "[" === i
                        ? (this.state = b.DOCTYPE_DTD)
                        : f(i) &&
                          ((this.state = b.DOCTYPE_QUOTED), (this.q = i)));
                  continue;
                case b.DOCTYPE_QUOTED:
                  (this.doctype += i),
                    i === this.q && ((this.q = ""), (this.state = b.DOCTYPE));
                  continue;
                case b.DOCTYPE_DTD:
                  (this.doctype += i),
                    "]" === i
                      ? (this.state = b.DOCTYPE)
                      : f(i) &&
                        ((this.state = b.DOCTYPE_DTD_QUOTED), (this.q = i));
                  continue;
                case b.DOCTYPE_DTD_QUOTED:
                  (this.doctype += i),
                    i === this.q &&
                      ((this.state = b.DOCTYPE_DTD), (this.q = ""));
                  continue;
                case b.COMMENT:
                  "-" === i
                    ? (this.state = b.COMMENT_ENDING)
                    : (this.comment += i);
                  continue;
                case b.COMMENT_ENDING:
                  "-" === i
                    ? ((this.state = b.COMMENT_ENDED),
                      (this.comment = S(this.opt, this.comment)),
                      this.comment && _(this, "oncomment", this.comment),
                      (this.comment = ""))
                    : ((this.comment += "-" + i), (this.state = b.COMMENT));
                  continue;
                case b.COMMENT_ENDED:
                  ">" !== i
                    ? (F(this, "Malformed comment"),
                      (this.comment += "--" + i),
                      (this.state = b.COMMENT))
                    : (this.state = b.TEXT);
                  continue;
                case b.CDATA:
                  "]" === i ? (this.state = b.CDATA_ENDING) : (this.cdata += i);
                  continue;
                case b.CDATA_ENDING:
                  "]" === i
                    ? (this.state = b.CDATA_ENDING_2)
                    : ((this.cdata += "]" + i), (this.state = b.CDATA));
                  continue;
                case b.CDATA_ENDING_2:
                  ">" === i
                    ? (this.cdata && _(this, "oncdata", this.cdata),
                      _(this, "onclosecdata"),
                      (this.cdata = ""),
                      (this.state = b.TEXT))
                    : "]" === i
                    ? (this.cdata += "]")
                    : ((this.cdata += "]]" + i), (this.state = b.CDATA));
                  continue;
                case b.PROC_INST:
                  "?" === i
                    ? (this.state = b.PROC_INST_ENDING)
                    : p(i)
                    ? (this.state = b.PROC_INST_BODY)
                    : (this.procInstName += i);
                  continue;
                case b.PROC_INST_BODY:
                  if (!this.procInstBody && p(i)) continue;
                  "?" === i
                    ? (this.state = b.PROC_INST_ENDING)
                    : (this.procInstBody += i);
                  continue;
                case b.PROC_INST_ENDING:
                  ">" === i
                    ? (_(this, "onprocessinginstruction", {
                        name: this.procInstName,
                        body: this.procInstBody,
                      }),
                      (this.procInstName = this.procInstBody = ""),
                      (this.state = b.TEXT))
                    : ((this.procInstBody += "?" + i),
                      (this.state = b.PROC_INST_BODY));
                  continue;
                case b.OPEN_TAG:
                  g(l, i)
                    ? (this.tagName += i)
                    : (k(this),
                      ">" === i
                        ? N(this)
                        : "/" === i
                        ? (this.state = b.OPEN_TAG_SLASH)
                        : (p(i) || F(this, "Invalid character in tag name"),
                          (this.state = b.ATTRIB)));
                  continue;
                case b.OPEN_TAG_SLASH:
                  ">" === i
                    ? (N(this, !0), I(this))
                    : (F(
                        this,
                        "Forward-slash in opening tag not followed by >"
                      ),
                      (this.state = b.ATTRIB));
                  continue;
                case b.ATTRIB:
                  if (p(i)) continue;
                  ">" === i
                    ? N(this)
                    : "/" === i
                    ? (this.state = b.OPEN_TAG_SLASH)
                    : g(c, i)
                    ? ((this.attribName = i),
                      (this.attribValue = ""),
                      (this.state = b.ATTRIB_NAME))
                    : F(this, "Invalid attribute name");
                  continue;
                case b.ATTRIB_NAME:
                  "=" === i
                    ? (this.state = b.ATTRIB_VALUE)
                    : ">" === i
                    ? (F(this, "Attribute without value"),
                      (this.attribValue = this.attribName),
                      O(this),
                      N(this))
                    : p(i)
                    ? (this.state = b.ATTRIB_NAME_SAW_WHITE)
                    : g(l, i)
                    ? (this.attribName += i)
                    : F(this, "Invalid attribute name");
                  continue;
                case b.ATTRIB_NAME_SAW_WHITE:
                  if ("=" === i) this.state = b.ATTRIB_VALUE;
                  else {
                    if (p(i)) continue;
                    F(this, "Attribute without value"),
                      (this.tag.attributes[this.attribName] = ""),
                      (this.attribValue = ""),
                      _(this, "onattribute", {
                        name: this.attribName,
                        value: "",
                      }),
                      (this.attribName = ""),
                      ">" === i
                        ? N(this)
                        : g(c, i)
                        ? ((this.attribName = i), (this.state = b.ATTRIB_NAME))
                        : (F(this, "Invalid attribute name"),
                          (this.state = b.ATTRIB));
                  }
                  continue;
                case b.ATTRIB_VALUE:
                  if (p(i)) continue;
                  f(i)
                    ? ((this.q = i), (this.state = b.ATTRIB_VALUE_QUOTED))
                    : (F(this, "Unquoted attribute value"),
                      (this.state = b.ATTRIB_VALUE_UNQUOTED),
                      (this.attribValue = i));
                  continue;
                case b.ATTRIB_VALUE_QUOTED:
                  if (i !== this.q) {
                    "&" === i
                      ? (this.state = b.ATTRIB_VALUE_ENTITY_Q)
                      : (this.attribValue += i);
                    continue;
                  }
                  O(this), (this.q = ""), (this.state = b.ATTRIB_VALUE_CLOSED);
                  continue;
                case b.ATTRIB_VALUE_CLOSED:
                  p(i)
                    ? (this.state = b.ATTRIB)
                    : ">" === i
                    ? N(this)
                    : "/" === i
                    ? (this.state = b.OPEN_TAG_SLASH)
                    : g(c, i)
                    ? (F(this, "No whitespace between attributes"),
                      (this.attribName = i),
                      (this.attribValue = ""),
                      (this.state = b.ATTRIB_NAME))
                    : F(this, "Invalid attribute name");
                  continue;
                case b.ATTRIB_VALUE_UNQUOTED:
                  if (!m(i)) {
                    "&" === i
                      ? (this.state = b.ATTRIB_VALUE_ENTITY_U)
                      : (this.attribValue += i);
                    continue;
                  }
                  O(this), ">" === i ? N(this) : (this.state = b.ATTRIB);
                  continue;
                case b.CLOSE_TAG:
                  if (this.tagName)
                    ">" === i
                      ? I(this)
                      : g(l, i)
                      ? (this.tagName += i)
                      : this.script
                      ? ((this.script += "</" + this.tagName),
                        (this.tagName = ""),
                        (this.state = b.SCRIPT))
                      : (p(i) || F(this, "Invalid tagname in closing tag"),
                        (this.state = b.CLOSE_TAG_SAW_WHITE));
                  else {
                    if (p(i)) continue;
                    y(c, i)
                      ? this.script
                        ? ((this.script += "</" + i), (this.state = b.SCRIPT))
                        : F(this, "Invalid tagname in closing tag.")
                      : (this.tagName = i);
                  }
                  continue;
                case b.CLOSE_TAG_SAW_WHITE:
                  if (p(i)) continue;
                  ">" === i
                    ? I(this)
                    : F(this, "Invalid characters in closing tag");
                  continue;
                case b.TEXT_ENTITY:
                case b.ATTRIB_VALUE_ENTITY_Q:
                case b.ATTRIB_VALUE_ENTITY_U:
                  var a, u;
                  switch (this.state) {
                    case b.TEXT_ENTITY:
                      (a = b.TEXT), (u = "textNode");
                      break;
                    case b.ATTRIB_VALUE_ENTITY_Q:
                      (a = b.ATTRIB_VALUE_QUOTED), (u = "attribValue");
                      break;
                    case b.ATTRIB_VALUE_ENTITY_U:
                      (a = b.ATTRIB_VALUE_UNQUOTED), (u = "attribValue");
                  }
                  ";" === i
                    ? ((this[u] += P(this)),
                      (this.entity = ""),
                      (this.state = a))
                    : g(this.entity.length ? d : h, i)
                    ? (this.entity += i)
                    : (F(this, "Invalid character in entity name"),
                      (this[u] += "&" + this.entity + i),
                      (this.entity = ""),
                      (this.state = a));
                  continue;
                default:
                  throw new Error(this, "Unknown state: " + this.state);
              }
            this.position >= this.bufferCheckPosition &&
              (function (t) {
                for (
                  var n = Math.max(e.MAX_BUFFER_LENGTH, 10),
                    i = 0,
                    s = 0,
                    o = r.length;
                  s < o;
                  s++
                ) {
                  var a = t[r[s]].length;
                  if (a > n)
                    switch (r[s]) {
                      case "textNode":
                        C(t);
                        break;
                      case "cdata":
                        _(t, "oncdata", t.cdata), (t.cdata = "");
                        break;
                      case "script":
                        _(t, "onscript", t.script), (t.script = "");
                        break;
                      default:
                        A(t, "Max buffer length exceeded: " + r[s]);
                    }
                  i = Math.max(i, a);
                }
                var u = e.MAX_BUFFER_LENGTH - i;
                t.bufferCheckPosition = u + t.position;
              })(this);
            return this;
          },
          resume: function () {
            return (this.error = null), this;
          },
          close: function () {
            return this.write(null);
          },
          flush: function () {
            var e;
            C((e = this)),
              "" !== e.cdata && (_(e, "oncdata", e.cdata), (e.cdata = "")),
              "" !== e.script && (_(e, "onscript", e.script), (e.script = ""));
          },
        });
      try {
        t = n("stream").Stream;
      } catch (e) {
        t = function () {};
      }
      var s = e.EVENTS.filter(function (e) {
        return "error" !== e && "end" !== e;
      });
      function o(e, n) {
        if (!(this instanceof o)) return new o(e, n);
        t.apply(this),
          (this._parser = new i(e, n)),
          (this.writable = !0),
          (this.readable = !0);
        var r = this;
        (this._parser.onend = function () {
          r.emit("end");
        }),
          (this._parser.onerror = function (e) {
            r.emit("error", e), (r._parser.error = null);
          }),
          (this._decoder = null),
          s.forEach(function (e) {
            Object.defineProperty(r, "on" + e, {
              get: function () {
                return r._parser["on" + e];
              },
              set: function (t) {
                if (!t)
                  return r.removeAllListeners(e), (r._parser["on" + e] = t), t;
                r.on(e, t);
              },
              enumerable: !0,
              configurable: !1,
            });
          });
      }
      (o.prototype = Object.create(t.prototype, { constructor: { value: o } })),
        (o.prototype.write = function (e) {
          if (
            "function" == typeof Buffer &&
            "function" == typeof Buffer.isBuffer &&
            Buffer.isBuffer(e)
          ) {
            if (!this._decoder) {
              var t = n("string_decoder").StringDecoder;
              this._decoder = new t("utf8");
            }
            e = this._decoder.write(e);
          }
          return this._parser.write(e.toString()), this.emit("data", e), !0;
        }),
        (o.prototype.end = function (e) {
          return e && e.length && this.write(e), this._parser.end(), !0;
        }),
        (o.prototype.on = function (e, n) {
          var r = this;
          return (
            r._parser["on" + e] ||
              -1 === s.indexOf(e) ||
              (r._parser["on" + e] = function () {
                var t =
                  1 === arguments.length
                    ? [arguments[0]]
                    : Array.apply(null, arguments);
                t.splice(0, 0, e), r.emit.apply(r, t);
              }),
            t.prototype.on.call(r, e, n)
          );
        });
      var a = "http://www.w3.org/XML/1998/namespace",
        u = { xml: a, xmlns: "http://www.w3.org/2000/xmlns/" },
        c = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/,
        l = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/,
        h = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/,
        d = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
      function p(e) {
        return " " === e || "\n" === e || "\r" === e || "\t" === e;
      }
      function f(e) {
        return '"' === e || "'" === e;
      }
      function m(e) {
        return ">" === e || p(e);
      }
      function g(e, t) {
        return e.test(t);
      }
      function y(e, t) {
        return !g(e, t);
      }
      var v,
        E,
        x,
        b = 0;
      for (var D in ((e.STATE = {
        BEGIN: b++,
        BEGIN_WHITESPACE: b++,
        TEXT: b++,
        TEXT_ENTITY: b++,
        OPEN_WAKA: b++,
        SGML_DECL: b++,
        SGML_DECL_QUOTED: b++,
        DOCTYPE: b++,
        DOCTYPE_QUOTED: b++,
        DOCTYPE_DTD: b++,
        DOCTYPE_DTD_QUOTED: b++,
        COMMENT_STARTING: b++,
        COMMENT: b++,
        COMMENT_ENDING: b++,
        COMMENT_ENDED: b++,
        CDATA: b++,
        CDATA_ENDING: b++,
        CDATA_ENDING_2: b++,
        PROC_INST: b++,
        PROC_INST_BODY: b++,
        PROC_INST_ENDING: b++,
        OPEN_TAG: b++,
        OPEN_TAG_SLASH: b++,
        ATTRIB: b++,
        ATTRIB_NAME: b++,
        ATTRIB_NAME_SAW_WHITE: b++,
        ATTRIB_VALUE: b++,
        ATTRIB_VALUE_QUOTED: b++,
        ATTRIB_VALUE_CLOSED: b++,
        ATTRIB_VALUE_UNQUOTED: b++,
        ATTRIB_VALUE_ENTITY_Q: b++,
        ATTRIB_VALUE_ENTITY_U: b++,
        CLOSE_TAG: b++,
        CLOSE_TAG_SAW_WHITE: b++,
        SCRIPT: b++,
        SCRIPT_ENDING: b++,
      }),
      (e.XML_ENTITIES = { amp: "&", gt: ">", lt: "<", quot: '"', apos: "'" }),
      (e.ENTITIES = {
        amp: "&",
        gt: ">",
        lt: "<",
        quot: '"',
        apos: "'",
        AElig: 198,
        Aacute: 193,
        Acirc: 194,
        Agrave: 192,
        Aring: 197,
        Atilde: 195,
        Auml: 196,
        Ccedil: 199,
        ETH: 208,
        Eacute: 201,
        Ecirc: 202,
        Egrave: 200,
        Euml: 203,
        Iacute: 205,
        Icirc: 206,
        Igrave: 204,
        Iuml: 207,
        Ntilde: 209,
        Oacute: 211,
        Ocirc: 212,
        Ograve: 210,
        Oslash: 216,
        Otilde: 213,
        Ouml: 214,
        THORN: 222,
        Uacute: 218,
        Ucirc: 219,
        Ugrave: 217,
        Uuml: 220,
        Yacute: 221,
        aacute: 225,
        acirc: 226,
        aelig: 230,
        agrave: 224,
        aring: 229,
        atilde: 227,
        auml: 228,
        ccedil: 231,
        eacute: 233,
        ecirc: 234,
        egrave: 232,
        eth: 240,
        euml: 235,
        iacute: 237,
        icirc: 238,
        igrave: 236,
        iuml: 239,
        ntilde: 241,
        oacute: 243,
        ocirc: 244,
        ograve: 242,
        oslash: 248,
        otilde: 245,
        ouml: 246,
        szlig: 223,
        thorn: 254,
        uacute: 250,
        ucirc: 251,
        ugrave: 249,
        uuml: 252,
        yacute: 253,
        yuml: 255,
        copy: 169,
        reg: 174,
        nbsp: 160,
        iexcl: 161,
        cent: 162,
        pound: 163,
        curren: 164,
        yen: 165,
        brvbar: 166,
        sect: 167,
        uml: 168,
        ordf: 170,
        laquo: 171,
        not: 172,
        shy: 173,
        macr: 175,
        deg: 176,
        plusmn: 177,
        sup1: 185,
        sup2: 178,
        sup3: 179,
        acute: 180,
        micro: 181,
        para: 182,
        middot: 183,
        cedil: 184,
        ordm: 186,
        raquo: 187,
        frac14: 188,
        frac12: 189,
        frac34: 190,
        iquest: 191,
        times: 215,
        divide: 247,
        OElig: 338,
        oelig: 339,
        Scaron: 352,
        scaron: 353,
        Yuml: 376,
        fnof: 402,
        circ: 710,
        tilde: 732,
        Alpha: 913,
        Beta: 914,
        Gamma: 915,
        Delta: 916,
        Epsilon: 917,
        Zeta: 918,
        Eta: 919,
        Theta: 920,
        Iota: 921,
        Kappa: 922,
        Lambda: 923,
        Mu: 924,
        Nu: 925,
        Xi: 926,
        Omicron: 927,
        Pi: 928,
        Rho: 929,
        Sigma: 931,
        Tau: 932,
        Upsilon: 933,
        Phi: 934,
        Chi: 935,
        Psi: 936,
        Omega: 937,
        alpha: 945,
        beta: 946,
        gamma: 947,
        delta: 948,
        epsilon: 949,
        zeta: 950,
        eta: 951,
        theta: 952,
        iota: 953,
        kappa: 954,
        lambda: 955,
        mu: 956,
        nu: 957,
        xi: 958,
        omicron: 959,
        pi: 960,
        rho: 961,
        sigmaf: 962,
        sigma: 963,
        tau: 964,
        upsilon: 965,
        phi: 966,
        chi: 967,
        psi: 968,
        omega: 969,
        thetasym: 977,
        upsih: 978,
        piv: 982,
        ensp: 8194,
        emsp: 8195,
        thinsp: 8201,
        zwnj: 8204,
        zwj: 8205,
        lrm: 8206,
        rlm: 8207,
        ndash: 8211,
        mdash: 8212,
        lsquo: 8216,
        rsquo: 8217,
        sbquo: 8218,
        ldquo: 8220,
        rdquo: 8221,
        bdquo: 8222,
        dagger: 8224,
        Dagger: 8225,
        bull: 8226,
        hellip: 8230,
        permil: 8240,
        prime: 8242,
        Prime: 8243,
        lsaquo: 8249,
        rsaquo: 8250,
        oline: 8254,
        frasl: 8260,
        euro: 8364,
        image: 8465,
        weierp: 8472,
        real: 8476,
        trade: 8482,
        alefsym: 8501,
        larr: 8592,
        uarr: 8593,
        rarr: 8594,
        darr: 8595,
        harr: 8596,
        crarr: 8629,
        lArr: 8656,
        uArr: 8657,
        rArr: 8658,
        dArr: 8659,
        hArr: 8660,
        forall: 8704,
        part: 8706,
        exist: 8707,
        empty: 8709,
        nabla: 8711,
        isin: 8712,
        notin: 8713,
        ni: 8715,
        prod: 8719,
        sum: 8721,
        minus: 8722,
        lowast: 8727,
        radic: 8730,
        prop: 8733,
        infin: 8734,
        ang: 8736,
        and: 8743,
        or: 8744,
        cap: 8745,
        cup: 8746,
        int: 8747,
        there4: 8756,
        sim: 8764,
        cong: 8773,
        asymp: 8776,
        ne: 8800,
        equiv: 8801,
        le: 8804,
        ge: 8805,
        sub: 8834,
        sup: 8835,
        nsub: 8836,
        sube: 8838,
        supe: 8839,
        oplus: 8853,
        otimes: 8855,
        perp: 8869,
        sdot: 8901,
        lceil: 8968,
        rceil: 8969,
        lfloor: 8970,
        rfloor: 8971,
        lang: 9001,
        rang: 9002,
        loz: 9674,
        spades: 9824,
        clubs: 9827,
        hearts: 9829,
        diams: 9830,
      }),
      Object.keys(e.ENTITIES).forEach(function (t) {
        var n = e.ENTITIES[t],
          r = "number" == typeof n ? String.fromCharCode(n) : n;
        e.ENTITIES[t] = r;
      }),
      e.STATE))
        e.STATE[e.STATE[D]] = D;
      function w(e, t, n) {
        e[t] && e[t](n);
      }
      function _(e, t, n) {
        e.textNode && C(e), w(e, t, n);
      }
      function C(e) {
        (e.textNode = S(e.opt, e.textNode)),
          e.textNode && w(e, "ontext", e.textNode),
          (e.textNode = "");
      }
      function S(e, t) {
        return (
          e.trim && (t = t.trim()),
          e.normalize && (t = t.replace(/\s+/g, " ")),
          t
        );
      }
      function A(e, t) {
        return (
          C(e),
          e.trackPosition &&
            (t +=
              "\nLine: " + e.line + "\nColumn: " + e.column + "\nChar: " + e.c),
          (t = new Error(t)),
          (e.error = t),
          w(e, "onerror", t),
          e
        );
      }
      function j(e) {
        return (
          e.sawRoot && !e.closedRoot && F(e, "Unclosed root tag"),
          e.state !== b.BEGIN &&
            e.state !== b.BEGIN_WHITESPACE &&
            e.state !== b.TEXT &&
            A(e, "Unexpected end"),
          C(e),
          (e.c = ""),
          (e.closed = !0),
          w(e, "onend"),
          i.call(e, e.strict, e.opt),
          e
        );
      }
      function F(e, t) {
        if ("object" != typeof e || !(e instanceof i))
          throw new Error("bad call to strictFail");
        e.strict && A(e, t);
      }
      function k(e) {
        e.strict || (e.tagName = e.tagName[e.looseCase]());
        var t = e.tags[e.tags.length - 1] || e,
          n = (e.tag = { name: e.tagName, attributes: {} });
        e.opt.xmlns && (n.ns = t.ns),
          (e.attribList.length = 0),
          _(e, "onopentagstart", n);
      }
      function T(e, t) {
        var n = e.indexOf(":") < 0 ? ["", e] : e.split(":"),
          r = n[0],
          i = n[1];
        return (
          t && "xmlns" === e && ((r = "xmlns"), (i = "")),
          { prefix: r, local: i }
        );
      }
      function O(e) {
        if (
          (e.strict || (e.attribName = e.attribName[e.looseCase]()),
          -1 !== e.attribList.indexOf(e.attribName) ||
            e.tag.attributes.hasOwnProperty(e.attribName))
        )
          e.attribName = e.attribValue = "";
        else {
          if (e.opt.xmlns) {
            var t = T(e.attribName, !0),
              n = t.prefix,
              r = t.local;
            if ("xmlns" === n)
              if ("xml" === r && e.attribValue !== a)
                F(
                  e,
                  "xml: prefix must be bound to " +
                    a +
                    "\nActual: " +
                    e.attribValue
                );
              else if (
                "xmlns" === r &&
                "http://www.w3.org/2000/xmlns/" !== e.attribValue
              )
                F(
                  e,
                  "xmlns: prefix must be bound to http://www.w3.org/2000/xmlns/\nActual: " +
                    e.attribValue
                );
              else {
                var i = e.tag,
                  s = e.tags[e.tags.length - 1] || e;
                i.ns === s.ns && (i.ns = Object.create(s.ns)),
                  (i.ns[r] = e.attribValue);
              }
            e.attribList.push([e.attribName, e.attribValue]);
          } else
            (e.tag.attributes[e.attribName] = e.attribValue),
              _(e, "onattribute", { name: e.attribName, value: e.attribValue });
          e.attribName = e.attribValue = "";
        }
      }
      function N(e, t) {
        if (e.opt.xmlns) {
          var n = e.tag,
            r = T(e.tagName);
          (n.prefix = r.prefix),
            (n.local = r.local),
            (n.uri = n.ns[r.prefix] || ""),
            n.prefix &&
              !n.uri &&
              (F(e, "Unbound namespace prefix: " + JSON.stringify(e.tagName)),
              (n.uri = r.prefix));
          var i = e.tags[e.tags.length - 1] || e;
          n.ns &&
            i.ns !== n.ns &&
            Object.keys(n.ns).forEach(function (t) {
              _(e, "onopennamespace", { prefix: t, uri: n.ns[t] });
            });
          for (var s = 0, o = e.attribList.length; s < o; s++) {
            var a = e.attribList[s],
              u = a[0],
              c = a[1],
              l = T(u, !0),
              h = l.prefix,
              d = l.local,
              p = "" === h ? "" : n.ns[h] || "",
              f = { name: u, value: c, prefix: h, local: d, uri: p };
            h &&
              "xmlns" !== h &&
              !p &&
              (F(e, "Unbound namespace prefix: " + JSON.stringify(h)),
              (f.uri = h)),
              (e.tag.attributes[u] = f),
              _(e, "onattribute", f);
          }
          e.attribList.length = 0;
        }
        (e.tag.isSelfClosing = !!t),
          (e.sawRoot = !0),
          e.tags.push(e.tag),
          _(e, "onopentag", e.tag),
          t ||
            (e.noscript || "script" !== e.tagName.toLowerCase()
              ? (e.state = b.TEXT)
              : (e.state = b.SCRIPT),
            (e.tag = null),
            (e.tagName = "")),
          (e.attribName = e.attribValue = ""),
          (e.attribList.length = 0);
      }
      function I(e) {
        if (!e.tagName)
          return (
            F(e, "Weird empty close tag."),
            (e.textNode += "</>"),
            void (e.state = b.TEXT)
          );
        if (e.script) {
          if ("script" !== e.tagName)
            return (
              (e.script += "</" + e.tagName + ">"),
              (e.tagName = ""),
              void (e.state = b.SCRIPT)
            );
          _(e, "onscript", e.script), (e.script = "");
        }
        var t = e.tags.length,
          n = e.tagName;
        e.strict || (n = n[e.looseCase]());
        for (var r = n; t--; ) {
          if (e.tags[t].name === r) break;
          F(e, "Unexpected close tag");
        }
        if (t < 0)
          return (
            F(e, "Unmatched closing tag: " + e.tagName),
            (e.textNode += "</" + e.tagName + ">"),
            void (e.state = b.TEXT)
          );
        e.tagName = n;
        for (var i = e.tags.length; i-- > t; ) {
          var s = (e.tag = e.tags.pop());
          (e.tagName = e.tag.name), _(e, "onclosetag", e.tagName);
          var o = {};
          for (var a in s.ns) o[a] = s.ns[a];
          var u = e.tags[e.tags.length - 1] || e;
          e.opt.xmlns &&
            s.ns !== u.ns &&
            Object.keys(s.ns).forEach(function (t) {
              var n = s.ns[t];
              _(e, "onclosenamespace", { prefix: t, uri: n });
            });
        }
        0 === t && (e.closedRoot = !0),
          (e.tagName = e.attribValue = e.attribName = ""),
          (e.attribList.length = 0),
          (e.state = b.TEXT);
      }
      function P(e) {
        var t,
          n = e.entity,
          r = n.toLowerCase(),
          i = "";
        return e.ENTITIES[n]
          ? e.ENTITIES[n]
          : e.ENTITIES[r]
          ? e.ENTITIES[r]
          : ("#" === (n = r).charAt(0) &&
              ("x" === n.charAt(1)
                ? ((n = n.slice(2)), (i = (t = parseInt(n, 16)).toString(16)))
                : ((n = n.slice(1)), (i = (t = parseInt(n, 10)).toString(10)))),
            (n = n.replace(/^0+/, "")),
            isNaN(t) || i.toLowerCase() !== n
              ? (F(e, "Invalid character entity"), "&" + e.entity + ";")
              : String.fromCodePoint(t));
      }
      function R(e, t) {
        "<" === t
          ? ((e.state = b.OPEN_WAKA), (e.startTagPosition = e.position))
          : p(t) ||
            (F(e, "Non-whitespace before first tag."),
            (e.textNode = t),
            (e.state = b.TEXT));
      }
      function L(e, t) {
        var n = "";
        return t < e.length && (n = e.charAt(t)), n;
      }
      (b = e.STATE),
        String.fromCodePoint ||
          ((v = String.fromCharCode),
          (E = Math.floor),
          (x = function () {
            var e,
              t,
              n = 16384,
              r = [],
              i = -1,
              s = arguments.length;
            if (!s) return "";
            for (var o = ""; ++i < s; ) {
              var a = Number(arguments[i]);
              if (!isFinite(a) || a < 0 || a > 1114111 || E(a) !== a)
                throw RangeError("Invalid code point: " + a);
              a <= 65535
                ? r.push(a)
                : ((e = 55296 + ((a -= 65536) >> 10)),
                  (t = (a % 1024) + 56320),
                  r.push(e, t)),
                (i + 1 === s || r.length > n) &&
                  ((o += v.apply(null, r)), (r.length = 0));
            }
            return o;
          }),
          Object.defineProperty
            ? Object.defineProperty(String, "fromCodePoint", {
                value: x,
                configurable: !0,
                writable: !0,
              })
            : (String.fromCodePoint = x));
    })(t);
  },
  "./node_modules/semver/semver.js": function (e, t) {
    var n;
    (t = e.exports = X),
      (n =
        "object" == typeof process &&
        process.env &&
        process.env.NODE_DEBUG &&
        /\bsemver\b/i.test(process.env.NODE_DEBUG)
          ? function () {
              var e = Array.prototype.slice.call(arguments, 0);
              e.unshift("SEMVER"), console.log.apply(console, e);
            }
          : function () {}),
      (t.SEMVER_SPEC_VERSION = "2.0.0");
    var r = Number.MAX_SAFE_INTEGER || 9007199254740991,
      i = (t.re = []),
      s = (t.src = []),
      o = 0,
      a = o++;
    s[a] = "0|[1-9]\\d*";
    var u = o++;
    s[u] = "[0-9]+";
    var c = o++;
    s[c] = "\\d*[a-zA-Z-][a-zA-Z0-9-]*";
    var l = o++;
    s[l] = "(" + s[a] + ")\\.(" + s[a] + ")\\.(" + s[a] + ")";
    var h = o++;
    s[h] = "(" + s[u] + ")\\.(" + s[u] + ")\\.(" + s[u] + ")";
    var d = o++;
    s[d] = "(?:" + s[a] + "|" + s[c] + ")";
    var p = o++;
    s[p] = "(?:" + s[u] + "|" + s[c] + ")";
    var f = o++;
    s[f] = "(?:-(" + s[d] + "(?:\\." + s[d] + ")*))";
    var m = o++;
    s[m] = "(?:-?(" + s[p] + "(?:\\." + s[p] + ")*))";
    var g = o++;
    s[g] = "[0-9A-Za-z-]+";
    var y = o++;
    s[y] = "(?:\\+(" + s[g] + "(?:\\." + s[g] + ")*))";
    var v = o++,
      E = "v?" + s[l] + s[f] + "?" + s[y] + "?";
    s[v] = "^" + E + "$";
    var x = "[v=\\s]*" + s[h] + s[m] + "?" + s[y] + "?",
      b = o++;
    s[b] = "^" + x + "$";
    var D = o++;
    s[D] = "((?:<|>)?=?)";
    var w = o++;
    s[w] = s[u] + "|x|X|\\*";
    var _ = o++;
    s[_] = s[a] + "|x|X|\\*";
    var C = o++;
    s[C] =
      "[v=\\s]*(" +
      s[_] +
      ")(?:\\.(" +
      s[_] +
      ")(?:\\.(" +
      s[_] +
      ")(?:" +
      s[f] +
      ")?" +
      s[y] +
      "?)?)?";
    var S = o++;
    s[S] =
      "[v=\\s]*(" +
      s[w] +
      ")(?:\\.(" +
      s[w] +
      ")(?:\\.(" +
      s[w] +
      ")(?:" +
      s[m] +
      ")?" +
      s[y] +
      "?)?)?";
    var A = o++;
    s[A] = "^" + s[D] + "\\s*" + s[C] + "$";
    var j = o++;
    s[j] = "^" + s[D] + "\\s*" + s[S] + "$";
    var F = o++;
    s[F] =
      "(?:^|[^\\d])(\\d{1,16})(?:\\.(\\d{1,16}))?(?:\\.(\\d{1,16}))?(?:$|[^\\d])";
    var k = o++;
    s[k] = "(?:~>?)";
    var T = o++;
    (s[T] = "(\\s*)" + s[k] + "\\s+"), (i[T] = new RegExp(s[T], "g"));
    var O = o++;
    s[O] = "^" + s[k] + s[C] + "$";
    var N = o++;
    s[N] = "^" + s[k] + s[S] + "$";
    var I = o++;
    s[I] = "(?:\\^)";
    var P = o++;
    (s[P] = "(\\s*)" + s[I] + "\\s+"), (i[P] = new RegExp(s[P], "g"));
    var R = o++;
    s[R] = "^" + s[I] + s[C] + "$";
    var L = o++;
    s[L] = "^" + s[I] + s[S] + "$";
    var M = o++;
    s[M] = "^" + s[D] + "\\s*(" + x + ")$|^$";
    var B = o++;
    s[B] = "^" + s[D] + "\\s*(" + E + ")$|^$";
    var U = o++;
    (s[U] = "(\\s*)" + s[D] + "\\s*(" + x + "|" + s[C] + ")"),
      (i[U] = new RegExp(s[U], "g"));
    var $ = o++;
    s[$] = "^\\s*(" + s[C] + ")\\s+-\\s+(" + s[C] + ")\\s*$";
    var G = o++;
    s[G] = "^\\s*(" + s[S] + ")\\s+-\\s+(" + s[S] + ")\\s*$";
    var z = o++;
    s[z] = "(<|>)?=?\\s*\\*";
    for (var q = 0; q < 35; q++) n(q, s[q]), i[q] || (i[q] = new RegExp(s[q]));
    function H(e, t) {
      if (
        ((t && "object" == typeof t) ||
          (t = { loose: !!t, includePrerelease: !1 }),
        e instanceof X)
      )
        return e;
      if ("string" != typeof e) return null;
      if (e.length > 256) return null;
      if (!(t.loose ? i[b] : i[v]).test(e)) return null;
      try {
        return new X(e, t);
      } catch (e) {
        return null;
      }
    }
    function X(e, t) {
      if (
        ((t && "object" == typeof t) ||
          (t = { loose: !!t, includePrerelease: !1 }),
        e instanceof X)
      ) {
        if (e.loose === t.loose) return e;
        e = e.version;
      } else if ("string" != typeof e)
        throw new TypeError("Invalid Version: " + e);
      if (e.length > 256)
        throw new TypeError("version is longer than 256 characters");
      if (!(this instanceof X)) return new X(e, t);
      n("SemVer", e, t), (this.options = t), (this.loose = !!t.loose);
      var s = e.trim().match(t.loose ? i[b] : i[v]);
      if (!s) throw new TypeError("Invalid Version: " + e);
      if (
        ((this.raw = e),
        (this.major = +s[1]),
        (this.minor = +s[2]),
        (this.patch = +s[3]),
        this.major > r || this.major < 0)
      )
        throw new TypeError("Invalid major version");
      if (this.minor > r || this.minor < 0)
        throw new TypeError("Invalid minor version");
      if (this.patch > r || this.patch < 0)
        throw new TypeError("Invalid patch version");
      s[4]
        ? (this.prerelease = s[4].split(".").map(function (e) {
            if (/^[0-9]+$/.test(e)) {
              var t = +e;
              if (t >= 0 && t < r) return t;
            }
            return e;
          }))
        : (this.prerelease = []),
        (this.build = s[5] ? s[5].split(".") : []),
        this.format();
    }
    (t.parse = H),
      (t.valid = function (e, t) {
        var n = H(e, t);
        return n ? n.version : null;
      }),
      (t.clean = function (e, t) {
        var n = H(e.trim().replace(/^[=v]+/, ""), t);
        return n ? n.version : null;
      }),
      (t.SemVer = X),
      (X.prototype.format = function () {
        return (
          (this.version = this.major + "." + this.minor + "." + this.patch),
          this.prerelease.length &&
            (this.version += "-" + this.prerelease.join(".")),
          this.version
        );
      }),
      (X.prototype.toString = function () {
        return this.version;
      }),
      (X.prototype.compare = function (e) {
        return (
          n("SemVer.compare", this.version, this.options, e),
          e instanceof X || (e = new X(e, this.options)),
          this.compareMain(e) || this.comparePre(e)
        );
      }),
      (X.prototype.compareMain = function (e) {
        return (
          e instanceof X || (e = new X(e, this.options)),
          W(this.major, e.major) ||
            W(this.minor, e.minor) ||
            W(this.patch, e.patch)
        );
      }),
      (X.prototype.comparePre = function (e) {
        if (
          (e instanceof X || (e = new X(e, this.options)),
          this.prerelease.length && !e.prerelease.length)
        )
          return -1;
        if (!this.prerelease.length && e.prerelease.length) return 1;
        if (!this.prerelease.length && !e.prerelease.length) return 0;
        var t = 0;
        do {
          var r = this.prerelease[t],
            i = e.prerelease[t];
          if ((n("prerelease compare", t, r, i), void 0 === r && void 0 === i))
            return 0;
          if (void 0 === i) return 1;
          if (void 0 === r) return -1;
          if (r !== i) return W(r, i);
        } while (++t);
      }),
      (X.prototype.inc = function (e, t) {
        switch (e) {
          case "premajor":
            (this.prerelease.length = 0),
              (this.patch = 0),
              (this.minor = 0),
              this.major++,
              this.inc("pre", t);
            break;
          case "preminor":
            (this.prerelease.length = 0),
              (this.patch = 0),
              this.minor++,
              this.inc("pre", t);
            break;
          case "prepatch":
            (this.prerelease.length = 0),
              this.inc("patch", t),
              this.inc("pre", t);
            break;
          case "prerelease":
            0 === this.prerelease.length && this.inc("patch", t),
              this.inc("pre", t);
            break;
          case "major":
            (0 === this.minor &&
              0 === this.patch &&
              0 !== this.prerelease.length) ||
              this.major++,
              (this.minor = 0),
              (this.patch = 0),
              (this.prerelease = []);
            break;
          case "minor":
            (0 === this.patch && 0 !== this.prerelease.length) || this.minor++,
              (this.patch = 0),
              (this.prerelease = []);
            break;
          case "patch":
            0 === this.prerelease.length && this.patch++,
              (this.prerelease = []);
            break;
          case "pre":
            if (0 === this.prerelease.length) this.prerelease = [0];
            else {
              for (var n = this.prerelease.length; --n >= 0; )
                "number" == typeof this.prerelease[n] &&
                  (this.prerelease[n]++, (n = -2));
              -1 === n && this.prerelease.push(0);
            }
            t &&
              (this.prerelease[0] === t
                ? isNaN(this.prerelease[1]) && (this.prerelease = [t, 0])
                : (this.prerelease = [t, 0]));
            break;
          default:
            throw new Error("invalid increment argument: " + e);
        }
        return this.format(), (this.raw = this.version), this;
      }),
      (t.inc = function (e, t, n, r) {
        "string" == typeof n && ((r = n), (n = void 0));
        try {
          return new X(e, n).inc(t, r).version;
        } catch (e) {
          return null;
        }
      }),
      (t.diff = function (e, t) {
        if (Q(e, t)) return null;
        var n = H(e),
          r = H(t),
          i = "";
        if (n.prerelease.length || r.prerelease.length) {
          i = "pre";
          var s = "prerelease";
        }
        for (var o in n)
          if (
            ("major" === o || "minor" === o || "patch" === o) &&
            n[o] !== r[o]
          )
            return i + o;
        return s;
      }),
      (t.compareIdentifiers = W);
    var J = /^[0-9]+$/;
    function W(e, t) {
      var n = J.test(e),
        r = J.test(t);
      return (
        n && r && ((e = +e), (t = +t)),
        e === t ? 0 : n && !r ? -1 : r && !n ? 1 : e < t ? -1 : 1
      );
    }
    function V(e, t, n) {
      return new X(e, n).compare(new X(t, n));
    }
    function Y(e, t, n) {
      return V(e, t, n) > 0;
    }
    function K(e, t, n) {
      return V(e, t, n) < 0;
    }
    function Q(e, t, n) {
      return 0 === V(e, t, n);
    }
    function Z(e, t, n) {
      return 0 !== V(e, t, n);
    }
    function ee(e, t, n) {
      return V(e, t, n) >= 0;
    }
    function te(e, t, n) {
      return V(e, t, n) <= 0;
    }
    function ne(e, t, n, r) {
      switch (t) {
        case "===":
          return (
            "object" == typeof e && (e = e.version),
            "object" == typeof n && (n = n.version),
            e === n
          );
        case "!==":
          return (
            "object" == typeof e && (e = e.version),
            "object" == typeof n && (n = n.version),
            e !== n
          );
        case "":
        case "=":
        case "==":
          return Q(e, n, r);
        case "!=":
          return Z(e, n, r);
        case ">":
          return Y(e, n, r);
        case ">=":
          return ee(e, n, r);
        case "<":
          return K(e, n, r);
        case "<=":
          return te(e, n, r);
        default:
          throw new TypeError("Invalid operator: " + t);
      }
    }
    function re(e, t) {
      if (
        ((t && "object" == typeof t) ||
          (t = { loose: !!t, includePrerelease: !1 }),
        e instanceof re)
      ) {
        if (e.loose === !!t.loose) return e;
        e = e.value;
      }
      if (!(this instanceof re)) return new re(e, t);
      n("comparator", e, t),
        (this.options = t),
        (this.loose = !!t.loose),
        this.parse(e),
        this.semver === ie
          ? (this.value = "")
          : (this.value = this.operator + this.semver.version),
        n("comp", this);
    }
    (t.rcompareIdentifiers = function (e, t) {
      return W(t, e);
    }),
      (t.major = function (e, t) {
        return new X(e, t).major;
      }),
      (t.minor = function (e, t) {
        return new X(e, t).minor;
      }),
      (t.patch = function (e, t) {
        return new X(e, t).patch;
      }),
      (t.compare = V),
      (t.compareLoose = function (e, t) {
        return V(e, t, !0);
      }),
      (t.rcompare = function (e, t, n) {
        return V(t, e, n);
      }),
      (t.sort = function (e, n) {
        return e.sort(function (e, r) {
          return t.compare(e, r, n);
        });
      }),
      (t.rsort = function (e, n) {
        return e.sort(function (e, r) {
          return t.rcompare(e, r, n);
        });
      }),
      (t.gt = Y),
      (t.lt = K),
      (t.eq = Q),
      (t.neq = Z),
      (t.gte = ee),
      (t.lte = te),
      (t.cmp = ne),
      (t.Comparator = re);
    var ie = {};
    function se(e, t) {
      if (
        ((t && "object" == typeof t) ||
          (t = { loose: !!t, includePrerelease: !1 }),
        e instanceof se)
      )
        return e.loose === !!t.loose &&
          e.includePrerelease === !!t.includePrerelease
          ? e
          : new se(e.raw, t);
      if (e instanceof re) return new se(e.value, t);
      if (!(this instanceof se)) return new se(e, t);
      if (
        ((this.options = t),
        (this.loose = !!t.loose),
        (this.includePrerelease = !!t.includePrerelease),
        (this.raw = e),
        (this.set = e
          .split(/\s*\|\|\s*/)
          .map(function (e) {
            return this.parseRange(e.trim());
          }, this)
          .filter(function (e) {
            return e.length;
          })),
        !this.set.length)
      )
        throw new TypeError("Invalid SemVer Range: " + e);
      this.format();
    }
    function oe(e) {
      return !e || "x" === e.toLowerCase() || "*" === e;
    }
    function ae(e, t, n, r, i, s, o, a, u, c, l, h, d) {
      return (
        (t = oe(n)
          ? ""
          : oe(r)
          ? ">=" + n + ".0.0"
          : oe(i)
          ? ">=" + n + "." + r + ".0"
          : ">=" + t) +
        " " +
        (a = oe(u)
          ? ""
          : oe(c)
          ? "<" + (+u + 1) + ".0.0"
          : oe(l)
          ? "<" + u + "." + (+c + 1) + ".0"
          : h
          ? "<=" + u + "." + c + "." + l + "-" + h
          : "<=" + a)
      ).trim();
    }
    function ue(e, t, r) {
      for (var i = 0; i < e.length; i++) if (!e[i].test(t)) return !1;
      if (t.prerelease.length && !r.includePrerelease) {
        for (i = 0; i < e.length; i++)
          if (
            (n(e[i].semver),
            e[i].semver !== ie && e[i].semver.prerelease.length > 0)
          ) {
            var s = e[i].semver;
            if (
              s.major === t.major &&
              s.minor === t.minor &&
              s.patch === t.patch
            )
              return !0;
          }
        return !1;
      }
      return !0;
    }
    function ce(e, t, n) {
      try {
        t = new se(t, n);
      } catch (e) {
        return !1;
      }
      return t.test(e);
    }
    function le(e, t, n, r) {
      var i, s, o, a, u;
      switch (((e = new X(e, r)), (t = new se(t, r)), n)) {
        case ">":
          (i = Y), (s = te), (o = K), (a = ">"), (u = ">=");
          break;
        case "<":
          (i = K), (s = ee), (o = Y), (a = "<"), (u = "<=");
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (ce(e, t, r)) return !1;
      for (var c = 0; c < t.set.length; ++c) {
        var l = t.set[c],
          h = null,
          d = null;
        if (
          (l.forEach(function (e) {
            e.semver === ie && (e = new re(">=0.0.0")),
              (h = h || e),
              (d = d || e),
              i(e.semver, h.semver, r)
                ? (h = e)
                : o(e.semver, d.semver, r) && (d = e);
          }),
          h.operator === a || h.operator === u)
        )
          return !1;
        if ((!d.operator || d.operator === a) && s(e, d.semver)) return !1;
        if (d.operator === u && o(e, d.semver)) return !1;
      }
      return !0;
    }
    (re.prototype.parse = function (e) {
      var t = this.options.loose ? i[M] : i[B],
        n = e.match(t);
      if (!n) throw new TypeError("Invalid comparator: " + e);
      (this.operator = n[1]),
        "=" === this.operator && (this.operator = ""),
        n[2]
          ? (this.semver = new X(n[2], this.options.loose))
          : (this.semver = ie);
    }),
      (re.prototype.toString = function () {
        return this.value;
      }),
      (re.prototype.test = function (e) {
        return (
          n("Comparator.test", e, this.options.loose),
          this.semver === ie ||
            ("string" == typeof e && (e = new X(e, this.options)),
            ne(e, this.operator, this.semver, this.options))
        );
      }),
      (re.prototype.intersects = function (e, t) {
        if (!(e instanceof re)) throw new TypeError("a Comparator is required");
        var n;
        if (
          ((t && "object" == typeof t) ||
            (t = { loose: !!t, includePrerelease: !1 }),
          "" === this.operator)
        )
          return (n = new se(e.value, t)), ce(this.value, n, t);
        if ("" === e.operator)
          return (n = new se(this.value, t)), ce(e.semver, n, t);
        var r = !(
            (">=" !== this.operator && ">" !== this.operator) ||
            (">=" !== e.operator && ">" !== e.operator)
          ),
          i = !(
            ("<=" !== this.operator && "<" !== this.operator) ||
            ("<=" !== e.operator && "<" !== e.operator)
          ),
          s = this.semver.version === e.semver.version,
          o = !(
            (">=" !== this.operator && "<=" !== this.operator) ||
            (">=" !== e.operator && "<=" !== e.operator)
          ),
          a =
            ne(this.semver, "<", e.semver, t) &&
            (">=" === this.operator || ">" === this.operator) &&
            ("<=" === e.operator || "<" === e.operator),
          u =
            ne(this.semver, ">", e.semver, t) &&
            ("<=" === this.operator || "<" === this.operator) &&
            (">=" === e.operator || ">" === e.operator);
        return r || i || (s && o) || a || u;
      }),
      (t.Range = se),
      (se.prototype.format = function () {
        return (
          (this.range = this.set
            .map(function (e) {
              return e.join(" ").trim();
            })
            .join("||")
            .trim()),
          this.range
        );
      }),
      (se.prototype.toString = function () {
        return this.range;
      }),
      (se.prototype.parseRange = function (e) {
        var t = this.options.loose;
        e = e.trim();
        var r = t ? i[G] : i[$];
        (e = e.replace(r, ae)),
          n("hyphen replace", e),
          (e = e.replace(i[U], "$1$2$3")),
          n("comparator trim", e, i[U]),
          (e = (e = (e = e.replace(i[T], "$1~")).replace(i[P], "$1^"))
            .split(/\s+/)
            .join(" "));
        var s = t ? i[M] : i[B],
          o = e
            .split(" ")
            .map(function (e) {
              return (function (e, t) {
                return (
                  n("comp", e, t),
                  (e = (function (e, t) {
                    return e
                      .trim()
                      .split(/\s+/)
                      .map(function (e) {
                        return (function (e, t) {
                          n("caret", e, t);
                          var r = t.loose ? i[L] : i[R];
                          return e.replace(r, function (t, r, i, s, o) {
                            var a;
                            return (
                              n("caret", e, t, r, i, s, o),
                              oe(r)
                                ? (a = "")
                                : oe(i)
                                ? (a = ">=" + r + ".0.0 <" + (+r + 1) + ".0.0")
                                : oe(s)
                                ? (a =
                                    "0" === r
                                      ? ">=" +
                                        r +
                                        "." +
                                        i +
                                        ".0 <" +
                                        r +
                                        "." +
                                        (+i + 1) +
                                        ".0"
                                      : ">=" +
                                        r +
                                        "." +
                                        i +
                                        ".0 <" +
                                        (+r + 1) +
                                        ".0.0")
                                : o
                                ? (n("replaceCaret pr", o),
                                  (a =
                                    "0" === r
                                      ? "0" === i
                                        ? ">=" +
                                          r +
                                          "." +
                                          i +
                                          "." +
                                          s +
                                          "-" +
                                          o +
                                          " <" +
                                          r +
                                          "." +
                                          i +
                                          "." +
                                          (+s + 1)
                                        : ">=" +
                                          r +
                                          "." +
                                          i +
                                          "." +
                                          s +
                                          "-" +
                                          o +
                                          " <" +
                                          r +
                                          "." +
                                          (+i + 1) +
                                          ".0"
                                      : ">=" +
                                        r +
                                        "." +
                                        i +
                                        "." +
                                        s +
                                        "-" +
                                        o +
                                        " <" +
                                        (+r + 1) +
                                        ".0.0"))
                                : (n("no pr"),
                                  (a =
                                    "0" === r
                                      ? "0" === i
                                        ? ">=" +
                                          r +
                                          "." +
                                          i +
                                          "." +
                                          s +
                                          " <" +
                                          r +
                                          "." +
                                          i +
                                          "." +
                                          (+s + 1)
                                        : ">=" +
                                          r +
                                          "." +
                                          i +
                                          "." +
                                          s +
                                          " <" +
                                          r +
                                          "." +
                                          (+i + 1) +
                                          ".0"
                                      : ">=" +
                                        r +
                                        "." +
                                        i +
                                        "." +
                                        s +
                                        " <" +
                                        (+r + 1) +
                                        ".0.0")),
                              n("caret return", a),
                              a
                            );
                          });
                        })(e, t);
                      })
                      .join(" ");
                  })(e, t)),
                  n("caret", e),
                  (e = (function (e, t) {
                    return e
                      .trim()
                      .split(/\s+/)
                      .map(function (e) {
                        return (function (e, t) {
                          var r = t.loose ? i[N] : i[O];
                          return e.replace(r, function (t, r, i, s, o) {
                            var a;
                            return (
                              n("tilde", e, t, r, i, s, o),
                              oe(r)
                                ? (a = "")
                                : oe(i)
                                ? (a = ">=" + r + ".0.0 <" + (+r + 1) + ".0.0")
                                : oe(s)
                                ? (a =
                                    ">=" +
                                    r +
                                    "." +
                                    i +
                                    ".0 <" +
                                    r +
                                    "." +
                                    (+i + 1) +
                                    ".0")
                                : o
                                ? (n("replaceTilde pr", o),
                                  (a =
                                    ">=" +
                                    r +
                                    "." +
                                    i +
                                    "." +
                                    s +
                                    "-" +
                                    o +
                                    " <" +
                                    r +
                                    "." +
                                    (+i + 1) +
                                    ".0"))
                                : (a =
                                    ">=" +
                                    r +
                                    "." +
                                    i +
                                    "." +
                                    s +
                                    " <" +
                                    r +
                                    "." +
                                    (+i + 1) +
                                    ".0"),
                              n("tilde return", a),
                              a
                            );
                          });
                        })(e, t);
                      })
                      .join(" ");
                  })(e, t)),
                  n("tildes", e),
                  (e = (function (e, t) {
                    return (
                      n("replaceXRanges", e, t),
                      e
                        .split(/\s+/)
                        .map(function (e) {
                          return (function (e, t) {
                            e = e.trim();
                            var r = t.loose ? i[j] : i[A];
                            return e.replace(r, function (t, r, i, s, o, a) {
                              n("xRange", e, t, r, i, s, o, a);
                              var u = oe(i),
                                c = u || oe(s),
                                l = c || oe(o);
                              return (
                                "=" === r && l && (r = ""),
                                u
                                  ? (t =
                                      ">" === r || "<" === r ? "<0.0.0" : "*")
                                  : r && l
                                  ? (c && (s = 0),
                                    (o = 0),
                                    ">" === r
                                      ? ((r = ">="),
                                        c
                                          ? ((i = +i + 1), (s = 0), (o = 0))
                                          : ((s = +s + 1), (o = 0)))
                                      : "<=" === r &&
                                        ((r = "<"),
                                        c ? (i = +i + 1) : (s = +s + 1)),
                                    (t = r + i + "." + s + "." + o))
                                  : c
                                  ? (t =
                                      ">=" + i + ".0.0 <" + (+i + 1) + ".0.0")
                                  : l &&
                                    (t =
                                      ">=" +
                                      i +
                                      "." +
                                      s +
                                      ".0 <" +
                                      i +
                                      "." +
                                      (+s + 1) +
                                      ".0"),
                                n("xRange return", t),
                                t
                              );
                            });
                          })(e, t);
                        })
                        .join(" ")
                    );
                  })(e, t)),
                  n("xrange", e),
                  (e = (function (e, t) {
                    return n("replaceStars", e, t), e.trim().replace(i[z], "");
                  })(e, t)),
                  n("stars", e),
                  e
                );
              })(e, this.options);
            }, this)
            .join(" ")
            .split(/\s+/);
        return (
          this.options.loose &&
            (o = o.filter(function (e) {
              return !!e.match(s);
            })),
          (o = o.map(function (e) {
            return new re(e, this.options);
          }, this))
        );
      }),
      (se.prototype.intersects = function (e, t) {
        if (!(e instanceof se)) throw new TypeError("a Range is required");
        return this.set.some(function (n) {
          return n.every(function (n) {
            return e.set.some(function (e) {
              return e.every(function (e) {
                return n.intersects(e, t);
              });
            });
          });
        });
      }),
      (t.toComparators = function (e, t) {
        return new se(e, t).set.map(function (e) {
          return e
            .map(function (e) {
              return e.value;
            })
            .join(" ")
            .trim()
            .split(" ");
        });
      }),
      (se.prototype.test = function (e) {
        if (!e) return !1;
        "string" == typeof e && (e = new X(e, this.options));
        for (var t = 0; t < this.set.length; t++)
          if (ue(this.set[t], e, this.options)) return !0;
        return !1;
      }),
      (t.satisfies = ce),
      (t.maxSatisfying = function (e, t, n) {
        var r = null,
          i = null;
        try {
          var s = new se(t, n);
        } catch (e) {
          return null;
        }
        return (
          e.forEach(function (e) {
            s.test(e) &&
              ((r && -1 !== i.compare(e)) || (i = new X((r = e), n)));
          }),
          r
        );
      }),
      (t.minSatisfying = function (e, t, n) {
        var r = null,
          i = null;
        try {
          var s = new se(t, n);
        } catch (e) {
          return null;
        }
        return (
          e.forEach(function (e) {
            s.test(e) && ((r && 1 !== i.compare(e)) || (i = new X((r = e), n)));
          }),
          r
        );
      }),
      (t.minVersion = function (e, t) {
        e = new se(e, t);
        var n = new X("0.0.0");
        if (e.test(n)) return n;
        if (((n = new X("0.0.0-0")), e.test(n))) return n;
        n = null;
        for (var r = 0; r < e.set.length; ++r) {
          e.set[r].forEach(function (e) {
            var t = new X(e.semver.version);
            switch (e.operator) {
              case ">":
                0 === t.prerelease.length ? t.patch++ : t.prerelease.push(0),
                  (t.raw = t.format());
              case "":
              case ">=":
                (n && !Y(n, t)) || (n = t);
                break;
              case "<":
              case "<=":
                break;
              default:
                throw new Error("Unexpected operation: " + e.operator);
            }
          });
        }
        if (n && e.test(n)) return n;
        return null;
      }),
      (t.validRange = function (e, t) {
        try {
          return new se(e, t).range || "*";
        } catch (e) {
          return null;
        }
      }),
      (t.ltr = function (e, t, n) {
        return le(e, t, "<", n);
      }),
      (t.gtr = function (e, t, n) {
        return le(e, t, ">", n);
      }),
      (t.outside = le),
      (t.prerelease = function (e, t) {
        var n = H(e, t);
        return n && n.prerelease.length ? n.prerelease : null;
      }),
      (t.intersects = function (e, t, n) {
        return (e = new se(e, n)), (t = new se(t, n)), e.intersects(t);
      }),
      (t.coerce = function (e) {
        if (e instanceof X) return e;
        if ("string" != typeof e) return null;
        var t = e.match(i[F]);
        if (null == t) return null;
        return H(t[1] + "." + (t[2] || "0") + "." + (t[3] || "0"));
      });
  },
  "./node_modules/source-map-support/source-map-support.js": function (
    e,
    t,
    n
  ) {
    (function (e) {
      var r,
        i = n("./node_modules/source-map/source-map.js").SourceMapConsumer,
        s = n("path");
      try {
        ((r = n("fs")).existsSync && r.readFileSync) || (r = null);
      } catch (e) {}
      var o = n("./node_modules/buffer-from/index.js");
      function a(e, t) {
        return e.require(t);
      }
      var u = !1,
        c = !1,
        l = !1,
        h = "auto",
        d = {},
        p = {},
        f = /^data:application\/json[^,]+base64,/,
        m = [],
        g = [];
      function y() {
        return (
          "browser" === h ||
          ("node" !== h &&
            "undefined" != typeof window &&
            "function" == typeof XMLHttpRequest &&
            !(
              window.require &&
              window.module &&
              window.process &&
              "renderer" === window.process.type
            ))
        );
      }
      function v(e) {
        return function (t) {
          for (var n = 0; n < e.length; n++) {
            var r = e[n](t);
            if (r) return r;
          }
          return null;
        };
      }
      var E = v(m);
      function x(e, t) {
        if (!e) return t;
        var n = s.dirname(e),
          r = /^\w+:\/\/[^\/]*/.exec(n),
          i = r ? r[0] : "",
          o = n.slice(i.length);
        return i && /^\/\w\:/.test(o)
          ? (i += "/") + s.resolve(n.slice(i.length), t).replace(/\\/g, "/")
          : i + s.resolve(n.slice(i.length), t);
      }
      m.push(function (e) {
        if (
          ((e = e.trim()),
          /^file:/.test(e) &&
            (e = e.replace(/file:\/\/\/(\w:)?/, function (e, t) {
              return t ? "" : "/";
            })),
          e in d)
        )
          return d[e];
        var t = "";
        try {
          if (r) r.existsSync(e) && (t = r.readFileSync(e, "utf8"));
          else {
            var n = new XMLHttpRequest();
            n.open("GET", e, !1),
              n.send(null),
              4 === n.readyState && 200 === n.status && (t = n.responseText);
          }
        } catch (e) {}
        return (d[e] = t);
      });
      var b = v(g);
      function D(e) {
        var t = p[e.source];
        if (!t) {
          var n = b(e.source);
          n
            ? (t = p[e.source] = { url: n.url, map: new i(n.map) }).map
                .sourcesContent &&
              t.map.sources.forEach(function (e, n) {
                var r = t.map.sourcesContent[n];
                if (r) {
                  var i = x(t.url, e);
                  d[i] = r;
                }
              })
            : (t = p[e.source] = { url: null, map: null });
        }
        if (t && t.map && "function" == typeof t.map.originalPositionFor) {
          var r = t.map.originalPositionFor(e);
          if (null !== r.source) return (r.source = x(t.url, r.source)), r;
        }
        return e;
      }
      function w() {
        var e,
          t = "";
        if (this.isNative()) t = "native";
        else {
          !(e = this.getScriptNameOrSourceURL()) &&
            this.isEval() &&
            ((t = this.getEvalOrigin()), (t += ", ")),
            (t += e || "<anonymous>");
          var n = this.getLineNumber();
          if (null != n) {
            t += ":" + n;
            var r = this.getColumnNumber();
            r && (t += ":" + r);
          }
        }
        var i = "",
          s = this.getFunctionName(),
          o = !0,
          a = this.isConstructor();
        if (!(this.isToplevel() || a)) {
          var u = this.getTypeName();
          "[object Object]" === u && (u = "null");
          var c = this.getMethodName();
          s
            ? (u && 0 != s.indexOf(u) && (i += u + "."),
              (i += s),
              c &&
                s.indexOf("." + c) != s.length - c.length - 1 &&
                (i += " [as " + c + "]"))
            : (i += u + "." + (c || "<anonymous>"));
        } else
          a
            ? (i += "new " + (s || "<anonymous>"))
            : s
            ? (i += s)
            : ((i += t), (o = !1));
        return o && (i += " (" + t + ")"), i;
      }
      function _(e) {
        var t = {};
        return (
          Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach(
            function (n) {
              t[n] = /^(?:is|get)/.test(n)
                ? function () {
                    return e[n].call(e);
                  }
                : e[n];
            }
          ),
          (t.toString = w),
          t
        );
      }
      function C(e, t) {
        if (
          (void 0 === t && (t = { nextPosition: null, curPosition: null }),
          e.isNative())
        )
          return (t.curPosition = null), e;
        var n = e.getFileName() || e.getScriptNameOrSourceURL();
        if (n) {
          var r = e.getLineNumber(),
            i = e.getColumnNumber() - 1,
            s = /^v(10\.1[6-9]|10\.[2-9][0-9]|10\.[0-9]{3,}|1[2-9]\d*|[2-9]\d|\d{3,}|11\.11)/.test(
              process.version
            )
              ? 0
              : 62;
          1 === r && i > s && !y() && !e.isEval() && (i -= s);
          var o = D({ source: n, line: r, column: i });
          t.curPosition = o;
          var a = (e = _(e)).getFunctionName;
          return (
            (e.getFunctionName = function () {
              return null == t.nextPosition ? a() : t.nextPosition.name || a();
            }),
            (e.getFileName = function () {
              return o.source;
            }),
            (e.getLineNumber = function () {
              return o.line;
            }),
            (e.getColumnNumber = function () {
              return o.column + 1;
            }),
            (e.getScriptNameOrSourceURL = function () {
              return o.source;
            }),
            e
          );
        }
        var u = e.isEval() && e.getEvalOrigin();
        return u
          ? ((u = (function e(t) {
              var n = /^eval at ([^(]+) \((.+):(\d+):(\d+)\)$/.exec(t);
              if (n) {
                var r = D({ source: n[2], line: +n[3], column: n[4] - 1 });
                return (
                  "eval at " +
                  n[1] +
                  " (" +
                  r.source +
                  ":" +
                  r.line +
                  ":" +
                  (r.column + 1) +
                  ")"
                );
              }
              return (n = /^eval at ([^(]+) \((.+)\)$/.exec(t))
                ? "eval at " + n[1] + " (" + e(n[2]) + ")"
                : t;
            })(u)),
            ((e = _(e)).getEvalOrigin = function () {
              return u;
            }),
            e)
          : e;
      }
      function S(e, t) {
        l && ((d = {}), (p = {}));
        for (
          var n = (e.name || "Error") + ": " + (e.message || ""),
            r = { nextPosition: null, curPosition: null },
            i = [],
            s = t.length - 1;
          s >= 0;
          s--
        )
          i.push("\n    at " + C(t[s], r)), (r.nextPosition = r.curPosition);
        return (
          (r.curPosition = r.nextPosition = null), n + i.reverse().join("")
        );
      }
      function A(e) {
        var t = /\n    at [^(]+ \((.*):(\d+):(\d+)\)/.exec(e.stack);
        if (t) {
          var n = t[1],
            i = +t[2],
            s = +t[3],
            o = d[n];
          if (!o && r && r.existsSync(n))
            try {
              o = r.readFileSync(n, "utf8");
            } catch (e) {
              o = "";
            }
          if (o) {
            var a = o.split(/(?:\r\n|\r|\n)/)[i - 1];
            if (a)
              return (
                n + ":" + i + "\n" + a + "\n" + new Array(s).join(" ") + "^"
              );
          }
        }
        return null;
      }
      function j(e) {
        var t = A(e);
        process.stderr._handle &&
          process.stderr._handle.setBlocking &&
          process.stderr._handle.setBlocking(!0),
          t && (console.error(), console.error(t)),
          console.error(e.stack),
          process.exit(1);
      }
      g.push(function (e) {
        var t,
          n = (function (e) {
            var t;
            if (y())
              try {
                var n = new XMLHttpRequest();
                n.open("GET", e, !1),
                  n.send(null),
                  (t = 4 === n.readyState ? n.responseText : null);
                var r =
                  n.getResponseHeader("SourceMap") ||
                  n.getResponseHeader("X-SourceMap");
                if (r) return r;
              } catch (e) {}
            t = E(e);
            for (
              var i,
                s,
                o = /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/gm;
              (s = o.exec(t));

            )
              i = s;
            return i ? i[1] : null;
          })(e);
        if (!n) return null;
        if (f.test(n)) {
          var r = n.slice(n.indexOf(",") + 1);
          (t = o(r, "base64").toString()), (n = e);
        } else (n = x(e, n)), (t = E(n));
        return t ? { url: n, map: t } : null;
      });
      var F = m.slice(0),
        k = g.slice(0);
      (t.wrapCallSite = C),
        (t.getErrorSource = A),
        (t.mapSourcePosition = D),
        (t.retrieveSourceMap = b),
        (t.install = function (t) {
          if (
            (t = t || {}).environment &&
            ((h = t.environment), -1 === ["node", "browser", "auto"].indexOf(h))
          )
            throw new Error(
              "environment " +
                h +
                " was unknown. Available options are {auto, browser, node}"
            );
          if (
            (t.retrieveFile &&
              (t.overrideRetrieveFile && (m.length = 0),
              m.unshift(t.retrieveFile)),
            t.retrieveSourceMap &&
              (t.overrideRetrieveSourceMap && (g.length = 0),
              g.unshift(t.retrieveSourceMap)),
            t.hookRequire && !y())
          ) {
            var n = a(e, "module"),
              r = n.prototype._compile;
            r.__sourceMapSupport ||
              ((n.prototype._compile = function (e, t) {
                return (d[t] = e), (p[t] = void 0), r.call(this, e, t);
              }),
              (n.prototype._compile.__sourceMapSupport = !0));
          }
          if (
            (l ||
              (l =
                "emptyCacheBetweenOperations" in t &&
                t.emptyCacheBetweenOperations),
            u || ((u = !0), (Error.prepareStackTrace = S)),
            !c)
          ) {
            var i =
              !("handleUncaughtExceptions" in t) || t.handleUncaughtExceptions;
            try {
              !1 === a(e, "worker_threads").isMainThread && (i = !1);
            } catch (e) {}
            i &&
              "object" == typeof process &&
              null !== process &&
              "function" == typeof process.on &&
              ((c = !0),
              (s = process.emit),
              (process.emit = function (e) {
                if ("uncaughtException" === e) {
                  var t = arguments[1] && arguments[1].stack,
                    n = this.listeners(e).length > 0;
                  if (t && !n) return j(arguments[1]);
                }
                return s.apply(this, arguments);
              }));
          }
          var s;
        }),
        (t.resetRetrieveHandlers = function () {
          (m.length = 0),
            (g.length = 0),
            (m = F.slice(0)),
            (g = k.slice(0)),
            (b = v(g)),
            (E = v(m));
        });
    }.call(this, n("./node_modules/webpack/buildin/module.js")(e)));
  },
  "./node_modules/source-map/lib/array-set.js": function (e, t, n) {
    var r = n("./node_modules/source-map/lib/util.js"),
      i = Object.prototype.hasOwnProperty,
      s = "undefined" != typeof Map;
    function o() {
      (this._array = []), (this._set = s ? new Map() : Object.create(null));
    }
    (o.fromArray = function (e, t) {
      for (var n = new o(), r = 0, i = e.length; r < i; r++) n.add(e[r], t);
      return n;
    }),
      (o.prototype.size = function () {
        return s
          ? this._set.size
          : Object.getOwnPropertyNames(this._set).length;
      }),
      (o.prototype.add = function (e, t) {
        var n = s ? e : r.toSetString(e),
          o = s ? this.has(e) : i.call(this._set, n),
          a = this._array.length;
        (o && !t) || this._array.push(e),
          o || (s ? this._set.set(e, a) : (this._set[n] = a));
      }),
      (o.prototype.has = function (e) {
        if (s) return this._set.has(e);
        var t = r.toSetString(e);
        return i.call(this._set, t);
      }),
      (o.prototype.indexOf = function (e) {
        if (s) {
          var t = this._set.get(e);
          if (t >= 0) return t;
        } else {
          var n = r.toSetString(e);
          if (i.call(this._set, n)) return this._set[n];
        }
        throw new Error('"' + e + '" is not in the set.');
      }),
      (o.prototype.at = function (e) {
        if (e >= 0 && e < this._array.length) return this._array[e];
        throw new Error("No element indexed by " + e);
      }),
      (o.prototype.toArray = function () {
        return this._array.slice();
      }),
      (t.ArraySet = o);
  },
  "./node_modules/source-map/lib/base64-vlq.js": function (e, t, n) {
    var r = n("./node_modules/source-map/lib/base64.js");
    (t.encode = function (e) {
      var t,
        n = "",
        i = (function (e) {
          return e < 0 ? 1 + (-e << 1) : 0 + (e << 1);
        })(e);
      do {
        (t = 31 & i), (i >>>= 5) > 0 && (t |= 32), (n += r.encode(t));
      } while (i > 0);
      return n;
    }),
      (t.decode = function (e, t, n) {
        var i,
          s,
          o,
          a,
          u = e.length,
          c = 0,
          l = 0;
        do {
          if (t >= u)
            throw new Error("Expected more digits in base 64 VLQ value.");
          if (-1 === (s = r.decode(e.charCodeAt(t++))))
            throw new Error("Invalid base64 digit: " + e.charAt(t - 1));
          (i = !!(32 & s)), (c += (s &= 31) << l), (l += 5);
        } while (i);
        (n.value = ((a = (o = c) >> 1), 1 == (1 & o) ? -a : a)), (n.rest = t);
      });
  },
  "./node_modules/source-map/lib/base64.js": function (e, t) {
    var n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split(
      ""
    );
    (t.encode = function (e) {
      if (0 <= e && e < n.length) return n[e];
      throw new TypeError("Must be between 0 and 63: " + e);
    }),
      (t.decode = function (e) {
        return 65 <= e && e <= 90
          ? e - 65
          : 97 <= e && e <= 122
          ? e - 97 + 26
          : 48 <= e && e <= 57
          ? e - 48 + 52
          : 43 == e
          ? 62
          : 47 == e
          ? 63
          : -1;
      });
  },
  "./node_modules/source-map/lib/binary-search.js": function (e, t) {
    (t.GREATEST_LOWER_BOUND = 1),
      (t.LEAST_UPPER_BOUND = 2),
      (t.search = function (e, n, r, i) {
        if (0 === n.length) return -1;
        var s = (function e(n, r, i, s, o, a) {
          var u = Math.floor((r - n) / 2) + n,
            c = o(i, s[u], !0);
          return 0 === c
            ? u
            : c > 0
            ? r - u > 1
              ? e(u, r, i, s, o, a)
              : a == t.LEAST_UPPER_BOUND
              ? r < s.length
                ? r
                : -1
              : u
            : u - n > 1
            ? e(n, u, i, s, o, a)
            : a == t.LEAST_UPPER_BOUND
            ? u
            : n < 0
            ? -1
            : n;
        })(-1, n.length, e, n, r, i || t.GREATEST_LOWER_BOUND);
        if (s < 0) return -1;
        for (; s - 1 >= 0 && 0 === r(n[s], n[s - 1], !0); ) --s;
        return s;
      });
  },
  "./node_modules/source-map/lib/mapping-list.js": function (e, t, n) {
    var r = n("./node_modules/source-map/lib/util.js");
    function i() {
      (this._array = []),
        (this._sorted = !0),
        (this._last = { generatedLine: -1, generatedColumn: 0 });
    }
    (i.prototype.unsortedForEach = function (e, t) {
      this._array.forEach(e, t);
    }),
      (i.prototype.add = function (e) {
        var t, n, i, s, o, a;
        (t = this._last),
          (n = e),
          (i = t.generatedLine),
          (s = n.generatedLine),
          (o = t.generatedColumn),
          (a = n.generatedColumn),
          s > i ||
          (s == i && a >= o) ||
          r.compareByGeneratedPositionsInflated(t, n) <= 0
            ? ((this._last = e), this._array.push(e))
            : ((this._sorted = !1), this._array.push(e));
      }),
      (i.prototype.toArray = function () {
        return (
          this._sorted ||
            (this._array.sort(r.compareByGeneratedPositionsInflated),
            (this._sorted = !0)),
          this._array
        );
      }),
      (t.MappingList = i);
  },
  "./node_modules/source-map/lib/quick-sort.js": function (e, t) {
    function n(e, t, n) {
      var r = e[t];
      (e[t] = e[n]), (e[n] = r);
    }
    function r(e, t, i, s) {
      if (i < s) {
        var o = i - 1;
        n(e, ((l = i), (h = s), Math.round(l + Math.random() * (h - l))), s);
        for (var a = e[s], u = i; u < s; u++)
          t(e[u], a) <= 0 && n(e, (o += 1), u);
        n(e, o + 1, u);
        var c = o + 1;
        r(e, t, i, c - 1), r(e, t, c + 1, s);
      }
      var l, h;
    }
    t.quickSort = function (e, t) {
      r(e, t, 0, e.length - 1);
    };
  },
  "./node_modules/source-map/lib/source-map-consumer.js": function (e, t, n) {
    var r = n("./node_modules/source-map/lib/util.js"),
      i = n("./node_modules/source-map/lib/binary-search.js"),
      s = n("./node_modules/source-map/lib/array-set.js").ArraySet,
      o = n("./node_modules/source-map/lib/base64-vlq.js"),
      a = n("./node_modules/source-map/lib/quick-sort.js").quickSort;
    function u(e, t) {
      var n = e;
      return (
        "string" == typeof e && (n = r.parseSourceMapInput(e)),
        null != n.sections ? new h(n, t) : new c(n, t)
      );
    }
    function c(e, t) {
      var n = e;
      "string" == typeof e && (n = r.parseSourceMapInput(e));
      var i = r.getArg(n, "version"),
        o = r.getArg(n, "sources"),
        a = r.getArg(n, "names", []),
        u = r.getArg(n, "sourceRoot", null),
        c = r.getArg(n, "sourcesContent", null),
        l = r.getArg(n, "mappings"),
        h = r.getArg(n, "file", null);
      if (i != this._version) throw new Error("Unsupported version: " + i);
      u && (u = r.normalize(u)),
        (o = o
          .map(String)
          .map(r.normalize)
          .map(function (e) {
            return u && r.isAbsolute(u) && r.isAbsolute(e)
              ? r.relative(u, e)
              : e;
          })),
        (this._names = s.fromArray(a.map(String), !0)),
        (this._sources = s.fromArray(o, !0)),
        (this._absoluteSources = this._sources.toArray().map(function (e) {
          return r.computeSourceURL(u, e, t);
        })),
        (this.sourceRoot = u),
        (this.sourcesContent = c),
        (this._mappings = l),
        (this._sourceMapURL = t),
        (this.file = h);
    }
    function l() {
      (this.generatedLine = 0),
        (this.generatedColumn = 0),
        (this.source = null),
        (this.originalLine = null),
        (this.originalColumn = null),
        (this.name = null);
    }
    function h(e, t) {
      var n = e;
      "string" == typeof e && (n = r.parseSourceMapInput(e));
      var i = r.getArg(n, "version"),
        o = r.getArg(n, "sections");
      if (i != this._version) throw new Error("Unsupported version: " + i);
      (this._sources = new s()), (this._names = new s());
      var a = { line: -1, column: 0 };
      this._sections = o.map(function (e) {
        if (e.url)
          throw new Error("Support for url field in sections not implemented.");
        var n = r.getArg(e, "offset"),
          i = r.getArg(n, "line"),
          s = r.getArg(n, "column");
        if (i < a.line || (i === a.line && s < a.column))
          throw new Error(
            "Section offsets must be ordered and non-overlapping."
          );
        return (
          (a = n),
          {
            generatedOffset: { generatedLine: i + 1, generatedColumn: s + 1 },
            consumer: new u(r.getArg(e, "map"), t),
          }
        );
      });
    }
    (u.fromSourceMap = function (e, t) {
      return c.fromSourceMap(e, t);
    }),
      (u.prototype._version = 3),
      (u.prototype.__generatedMappings = null),
      Object.defineProperty(u.prototype, "_generatedMappings", {
        configurable: !0,
        enumerable: !0,
        get: function () {
          return (
            this.__generatedMappings ||
              this._parseMappings(this._mappings, this.sourceRoot),
            this.__generatedMappings
          );
        },
      }),
      (u.prototype.__originalMappings = null),
      Object.defineProperty(u.prototype, "_originalMappings", {
        configurable: !0,
        enumerable: !0,
        get: function () {
          return (
            this.__originalMappings ||
              this._parseMappings(this._mappings, this.sourceRoot),
            this.__originalMappings
          );
        },
      }),
      (u.prototype._charIsMappingSeparator = function (e, t) {
        var n = e.charAt(t);
        return ";" === n || "," === n;
      }),
      (u.prototype._parseMappings = function (e, t) {
        throw new Error("Subclasses must implement _parseMappings");
      }),
      (u.GENERATED_ORDER = 1),
      (u.ORIGINAL_ORDER = 2),
      (u.GREATEST_LOWER_BOUND = 1),
      (u.LEAST_UPPER_BOUND = 2),
      (u.prototype.eachMapping = function (e, t, n) {
        var i,
          s = t || null;
        switch (n || u.GENERATED_ORDER) {
          case u.GENERATED_ORDER:
            i = this._generatedMappings;
            break;
          case u.ORIGINAL_ORDER:
            i = this._originalMappings;
            break;
          default:
            throw new Error("Unknown order of iteration.");
        }
        var o = this.sourceRoot;
        i.map(function (e) {
          var t = null === e.source ? null : this._sources.at(e.source);
          return {
            source: (t = r.computeSourceURL(o, t, this._sourceMapURL)),
            generatedLine: e.generatedLine,
            generatedColumn: e.generatedColumn,
            originalLine: e.originalLine,
            originalColumn: e.originalColumn,
            name: null === e.name ? null : this._names.at(e.name),
          };
        }, this).forEach(e, s);
      }),
      (u.prototype.allGeneratedPositionsFor = function (e) {
        var t = r.getArg(e, "line"),
          n = {
            source: r.getArg(e, "source"),
            originalLine: t,
            originalColumn: r.getArg(e, "column", 0),
          };
        if (((n.source = this._findSourceIndex(n.source)), n.source < 0))
          return [];
        var s = [],
          o = this._findMapping(
            n,
            this._originalMappings,
            "originalLine",
            "originalColumn",
            r.compareByOriginalPositions,
            i.LEAST_UPPER_BOUND
          );
        if (o >= 0) {
          var a = this._originalMappings[o];
          if (void 0 === e.column)
            for (var u = a.originalLine; a && a.originalLine === u; )
              s.push({
                line: r.getArg(a, "generatedLine", null),
                column: r.getArg(a, "generatedColumn", null),
                lastColumn: r.getArg(a, "lastGeneratedColumn", null),
              }),
                (a = this._originalMappings[++o]);
          else
            for (
              var c = a.originalColumn;
              a && a.originalLine === t && a.originalColumn == c;

            )
              s.push({
                line: r.getArg(a, "generatedLine", null),
                column: r.getArg(a, "generatedColumn", null),
                lastColumn: r.getArg(a, "lastGeneratedColumn", null),
              }),
                (a = this._originalMappings[++o]);
        }
        return s;
      }),
      (t.SourceMapConsumer = u),
      (c.prototype = Object.create(u.prototype)),
      (c.prototype.consumer = u),
      (c.prototype._findSourceIndex = function (e) {
        var t,
          n = e;
        if (
          (null != this.sourceRoot && (n = r.relative(this.sourceRoot, n)),
          this._sources.has(n))
        )
          return this._sources.indexOf(n);
        for (t = 0; t < this._absoluteSources.length; ++t)
          if (this._absoluteSources[t] == e) return t;
        return -1;
      }),
      (c.fromSourceMap = function (e, t) {
        var n = Object.create(c.prototype),
          i = (n._names = s.fromArray(e._names.toArray(), !0)),
          o = (n._sources = s.fromArray(e._sources.toArray(), !0));
        (n.sourceRoot = e._sourceRoot),
          (n.sourcesContent = e._generateSourcesContent(
            n._sources.toArray(),
            n.sourceRoot
          )),
          (n.file = e._file),
          (n._sourceMapURL = t),
          (n._absoluteSources = n._sources.toArray().map(function (e) {
            return r.computeSourceURL(n.sourceRoot, e, t);
          }));
        for (
          var u = e._mappings.toArray().slice(),
            h = (n.__generatedMappings = []),
            d = (n.__originalMappings = []),
            p = 0,
            f = u.length;
          p < f;
          p++
        ) {
          var m = u[p],
            g = new l();
          (g.generatedLine = m.generatedLine),
            (g.generatedColumn = m.generatedColumn),
            m.source &&
              ((g.source = o.indexOf(m.source)),
              (g.originalLine = m.originalLine),
              (g.originalColumn = m.originalColumn),
              m.name && (g.name = i.indexOf(m.name)),
              d.push(g)),
            h.push(g);
        }
        return a(n.__originalMappings, r.compareByOriginalPositions), n;
      }),
      (c.prototype._version = 3),
      Object.defineProperty(c.prototype, "sources", {
        get: function () {
          return this._absoluteSources.slice();
        },
      }),
      (c.prototype._parseMappings = function (e, t) {
        for (
          var n,
            i,
            s,
            u,
            c,
            h = 1,
            d = 0,
            p = 0,
            f = 0,
            m = 0,
            g = 0,
            y = e.length,
            v = 0,
            E = {},
            x = {},
            b = [],
            D = [];
          v < y;

        )
          if (";" === e.charAt(v)) h++, v++, (d = 0);
          else if ("," === e.charAt(v)) v++;
          else {
            for (
              (n = new l()).generatedLine = h, u = v;
              u < y && !this._charIsMappingSeparator(e, u);
              u++
            );
            if ((s = E[(i = e.slice(v, u))])) v += i.length;
            else {
              for (s = []; v < u; )
                o.decode(e, v, x), (c = x.value), (v = x.rest), s.push(c);
              if (2 === s.length)
                throw new Error("Found a source, but no line and column");
              if (3 === s.length)
                throw new Error("Found a source and line, but no column");
              E[i] = s;
            }
            (n.generatedColumn = d + s[0]),
              (d = n.generatedColumn),
              s.length > 1 &&
                ((n.source = m + s[1]),
                (m += s[1]),
                (n.originalLine = p + s[2]),
                (p = n.originalLine),
                (n.originalLine += 1),
                (n.originalColumn = f + s[3]),
                (f = n.originalColumn),
                s.length > 4 && ((n.name = g + s[4]), (g += s[4]))),
              D.push(n),
              "number" == typeof n.originalLine && b.push(n);
          }
        a(D, r.compareByGeneratedPositionsDeflated),
          (this.__generatedMappings = D),
          a(b, r.compareByOriginalPositions),
          (this.__originalMappings = b);
      }),
      (c.prototype._findMapping = function (e, t, n, r, s, o) {
        if (e[n] <= 0)
          throw new TypeError(
            "Line must be greater than or equal to 1, got " + e[n]
          );
        if (e[r] < 0)
          throw new TypeError(
            "Column must be greater than or equal to 0, got " + e[r]
          );
        return i.search(e, t, s, o);
      }),
      (c.prototype.computeColumnSpans = function () {
        for (var e = 0; e < this._generatedMappings.length; ++e) {
          var t = this._generatedMappings[e];
          if (e + 1 < this._generatedMappings.length) {
            var n = this._generatedMappings[e + 1];
            if (t.generatedLine === n.generatedLine) {
              t.lastGeneratedColumn = n.generatedColumn - 1;
              continue;
            }
          }
          t.lastGeneratedColumn = 1 / 0;
        }
      }),
      (c.prototype.originalPositionFor = function (e) {
        var t = {
            generatedLine: r.getArg(e, "line"),
            generatedColumn: r.getArg(e, "column"),
          },
          n = this._findMapping(
            t,
            this._generatedMappings,
            "generatedLine",
            "generatedColumn",
            r.compareByGeneratedPositionsDeflated,
            r.getArg(e, "bias", u.GREATEST_LOWER_BOUND)
          );
        if (n >= 0) {
          var i = this._generatedMappings[n];
          if (i.generatedLine === t.generatedLine) {
            var s = r.getArg(i, "source", null);
            null !== s &&
              ((s = this._sources.at(s)),
              (s = r.computeSourceURL(this.sourceRoot, s, this._sourceMapURL)));
            var o = r.getArg(i, "name", null);
            return (
              null !== o && (o = this._names.at(o)),
              {
                source: s,
                line: r.getArg(i, "originalLine", null),
                column: r.getArg(i, "originalColumn", null),
                name: o,
              }
            );
          }
        }
        return { source: null, line: null, column: null, name: null };
      }),
      (c.prototype.hasContentsOfAllSources = function () {
        return (
          !!this.sourcesContent &&
          this.sourcesContent.length >= this._sources.size() &&
          !this.sourcesContent.some(function (e) {
            return null == e;
          })
        );
      }),
      (c.prototype.sourceContentFor = function (e, t) {
        if (!this.sourcesContent) return null;
        var n = this._findSourceIndex(e);
        if (n >= 0) return this.sourcesContent[n];
        var i,
          s = e;
        if (
          (null != this.sourceRoot && (s = r.relative(this.sourceRoot, s)),
          null != this.sourceRoot && (i = r.urlParse(this.sourceRoot)))
        ) {
          var o = s.replace(/^file:\/\//, "");
          if ("file" == i.scheme && this._sources.has(o))
            return this.sourcesContent[this._sources.indexOf(o)];
          if ((!i.path || "/" == i.path) && this._sources.has("/" + s))
            return this.sourcesContent[this._sources.indexOf("/" + s)];
        }
        if (t) return null;
        throw new Error('"' + s + '" is not in the SourceMap.');
      }),
      (c.prototype.generatedPositionFor = function (e) {
        var t = r.getArg(e, "source");
        if ((t = this._findSourceIndex(t)) < 0)
          return { line: null, column: null, lastColumn: null };
        var n = {
            source: t,
            originalLine: r.getArg(e, "line"),
            originalColumn: r.getArg(e, "column"),
          },
          i = this._findMapping(
            n,
            this._originalMappings,
            "originalLine",
            "originalColumn",
            r.compareByOriginalPositions,
            r.getArg(e, "bias", u.GREATEST_LOWER_BOUND)
          );
        if (i >= 0) {
          var s = this._originalMappings[i];
          if (s.source === n.source)
            return {
              line: r.getArg(s, "generatedLine", null),
              column: r.getArg(s, "generatedColumn", null),
              lastColumn: r.getArg(s, "lastGeneratedColumn", null),
            };
        }
        return { line: null, column: null, lastColumn: null };
      }),
      (t.BasicSourceMapConsumer = c),
      (h.prototype = Object.create(u.prototype)),
      (h.prototype.constructor = u),
      (h.prototype._version = 3),
      Object.defineProperty(h.prototype, "sources", {
        get: function () {
          for (var e = [], t = 0; t < this._sections.length; t++)
            for (var n = 0; n < this._sections[t].consumer.sources.length; n++)
              e.push(this._sections[t].consumer.sources[n]);
          return e;
        },
      }),
      (h.prototype.originalPositionFor = function (e) {
        var t = {
            generatedLine: r.getArg(e, "line"),
            generatedColumn: r.getArg(e, "column"),
          },
          n = i.search(t, this._sections, function (e, t) {
            var n = e.generatedLine - t.generatedOffset.generatedLine;
            return n || e.generatedColumn - t.generatedOffset.generatedColumn;
          }),
          s = this._sections[n];
        return s
          ? s.consumer.originalPositionFor({
              line: t.generatedLine - (s.generatedOffset.generatedLine - 1),
              column:
                t.generatedColumn -
                (s.generatedOffset.generatedLine === t.generatedLine
                  ? s.generatedOffset.generatedColumn - 1
                  : 0),
              bias: e.bias,
            })
          : { source: null, line: null, column: null, name: null };
      }),
      (h.prototype.hasContentsOfAllSources = function () {
        return this._sections.every(function (e) {
          return e.consumer.hasContentsOfAllSources();
        });
      }),
      (h.prototype.sourceContentFor = function (e, t) {
        for (var n = 0; n < this._sections.length; n++) {
          var r = this._sections[n].consumer.sourceContentFor(e, !0);
          if (r) return r;
        }
        if (t) return null;
        throw new Error('"' + e + '" is not in the SourceMap.');
      }),
      (h.prototype.generatedPositionFor = function (e) {
        for (var t = 0; t < this._sections.length; t++) {
          var n = this._sections[t];
          if (-1 !== n.consumer._findSourceIndex(r.getArg(e, "source"))) {
            var i = n.consumer.generatedPositionFor(e);
            if (i)
              return {
                line: i.line + (n.generatedOffset.generatedLine - 1),
                column:
                  i.column +
                  (n.generatedOffset.generatedLine === i.line
                    ? n.generatedOffset.generatedColumn - 1
                    : 0),
              };
          }
        }
        return { line: null, column: null };
      }),
      (h.prototype._parseMappings = function (e, t) {
        (this.__generatedMappings = []), (this.__originalMappings = []);
        for (var n = 0; n < this._sections.length; n++)
          for (
            var i = this._sections[n], s = i.consumer._generatedMappings, o = 0;
            o < s.length;
            o++
          ) {
            var u = s[o],
              c = i.consumer._sources.at(u.source);
            (c = r.computeSourceURL(
              i.consumer.sourceRoot,
              c,
              this._sourceMapURL
            )),
              this._sources.add(c),
              (c = this._sources.indexOf(c));
            var l = null;
            u.name &&
              ((l = i.consumer._names.at(u.name)),
              this._names.add(l),
              (l = this._names.indexOf(l)));
            var h = {
              source: c,
              generatedLine:
                u.generatedLine + (i.generatedOffset.generatedLine - 1),
              generatedColumn:
                u.generatedColumn +
                (i.generatedOffset.generatedLine === u.generatedLine
                  ? i.generatedOffset.generatedColumn - 1
                  : 0),
              originalLine: u.originalLine,
              originalColumn: u.originalColumn,
              name: l,
            };
            this.__generatedMappings.push(h),
              "number" == typeof h.originalLine &&
                this.__originalMappings.push(h);
          }
        a(this.__generatedMappings, r.compareByGeneratedPositionsDeflated),
          a(this.__originalMappings, r.compareByOriginalPositions);
      }),
      (t.IndexedSourceMapConsumer = h);
  },
  "./node_modules/source-map/lib/source-map-generator.js": function (e, t, n) {
    var r = n("./node_modules/source-map/lib/base64-vlq.js"),
      i = n("./node_modules/source-map/lib/util.js"),
      s = n("./node_modules/source-map/lib/array-set.js").ArraySet,
      o = n("./node_modules/source-map/lib/mapping-list.js").MappingList;
    function a(e) {
      e || (e = {}),
        (this._file = i.getArg(e, "file", null)),
        (this._sourceRoot = i.getArg(e, "sourceRoot", null)),
        (this._skipValidation = i.getArg(e, "skipValidation", !1)),
        (this._sources = new s()),
        (this._names = new s()),
        (this._mappings = new o()),
        (this._sourcesContents = null);
    }
    (a.prototype._version = 3),
      (a.fromSourceMap = function (e) {
        var t = e.sourceRoot,
          n = new a({ file: e.file, sourceRoot: t });
        return (
          e.eachMapping(function (e) {
            var r = {
              generated: { line: e.generatedLine, column: e.generatedColumn },
            };
            null != e.source &&
              ((r.source = e.source),
              null != t && (r.source = i.relative(t, r.source)),
              (r.original = { line: e.originalLine, column: e.originalColumn }),
              null != e.name && (r.name = e.name)),
              n.addMapping(r);
          }),
          e.sources.forEach(function (r) {
            var s = r;
            null !== t && (s = i.relative(t, r)),
              n._sources.has(s) || n._sources.add(s);
            var o = e.sourceContentFor(r);
            null != o && n.setSourceContent(r, o);
          }),
          n
        );
      }),
      (a.prototype.addMapping = function (e) {
        var t = i.getArg(e, "generated"),
          n = i.getArg(e, "original", null),
          r = i.getArg(e, "source", null),
          s = i.getArg(e, "name", null);
        this._skipValidation || this._validateMapping(t, n, r, s),
          null != r &&
            ((r = String(r)), this._sources.has(r) || this._sources.add(r)),
          null != s &&
            ((s = String(s)), this._names.has(s) || this._names.add(s)),
          this._mappings.add({
            generatedLine: t.line,
            generatedColumn: t.column,
            originalLine: null != n && n.line,
            originalColumn: null != n && n.column,
            source: r,
            name: s,
          });
      }),
      (a.prototype.setSourceContent = function (e, t) {
        var n = e;
        null != this._sourceRoot && (n = i.relative(this._sourceRoot, n)),
          null != t
            ? (this._sourcesContents ||
                (this._sourcesContents = Object.create(null)),
              (this._sourcesContents[i.toSetString(n)] = t))
            : this._sourcesContents &&
              (delete this._sourcesContents[i.toSetString(n)],
              0 === Object.keys(this._sourcesContents).length &&
                (this._sourcesContents = null));
      }),
      (a.prototype.applySourceMap = function (e, t, n) {
        var r = t;
        if (null == t) {
          if (null == e.file)
            throw new Error(
              'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, or the source map\'s "file" property. Both were omitted.'
            );
          r = e.file;
        }
        var o = this._sourceRoot;
        null != o && (r = i.relative(o, r));
        var a = new s(),
          u = new s();
        this._mappings.unsortedForEach(function (t) {
          if (t.source === r && null != t.originalLine) {
            var s = e.originalPositionFor({
              line: t.originalLine,
              column: t.originalColumn,
            });
            null != s.source &&
              ((t.source = s.source),
              null != n && (t.source = i.join(n, t.source)),
              null != o && (t.source = i.relative(o, t.source)),
              (t.originalLine = s.line),
              (t.originalColumn = s.column),
              null != s.name && (t.name = s.name));
          }
          var c = t.source;
          null == c || a.has(c) || a.add(c);
          var l = t.name;
          null == l || u.has(l) || u.add(l);
        }, this),
          (this._sources = a),
          (this._names = u),
          e.sources.forEach(function (t) {
            var r = e.sourceContentFor(t);
            null != r &&
              (null != n && (t = i.join(n, t)),
              null != o && (t = i.relative(o, t)),
              this.setSourceContent(t, r));
          }, this);
      }),
      (a.prototype._validateMapping = function (e, t, n, r) {
        if (t && "number" != typeof t.line && "number" != typeof t.column)
          throw new Error(
            "original.line and original.column are not numbers -- you probably meant to omit the original mapping entirely and only map the generated position. If so, pass null for the original mapping instead of an object with empty or null values."
          );
        if (
          (!(
            e &&
            "line" in e &&
            "column" in e &&
            e.line > 0 &&
            e.column >= 0
          ) ||
            t ||
            n ||
            r) &&
          !(
            e &&
            "line" in e &&
            "column" in e &&
            t &&
            "line" in t &&
            "column" in t &&
            e.line > 0 &&
            e.column >= 0 &&
            t.line > 0 &&
            t.column >= 0 &&
            n
          )
        )
          throw new Error(
            "Invalid mapping: " +
              JSON.stringify({ generated: e, source: n, original: t, name: r })
          );
      }),
      (a.prototype._serializeMappings = function () {
        for (
          var e,
            t,
            n,
            s,
            o = 0,
            a = 1,
            u = 0,
            c = 0,
            l = 0,
            h = 0,
            d = "",
            p = this._mappings.toArray(),
            f = 0,
            m = p.length;
          f < m;
          f++
        ) {
          if (((e = ""), (t = p[f]).generatedLine !== a))
            for (o = 0; t.generatedLine !== a; ) (e += ";"), a++;
          else if (f > 0) {
            if (!i.compareByGeneratedPositionsInflated(t, p[f - 1])) continue;
            e += ",";
          }
          (e += r.encode(t.generatedColumn - o)),
            (o = t.generatedColumn),
            null != t.source &&
              ((s = this._sources.indexOf(t.source)),
              (e += r.encode(s - h)),
              (h = s),
              (e += r.encode(t.originalLine - 1 - c)),
              (c = t.originalLine - 1),
              (e += r.encode(t.originalColumn - u)),
              (u = t.originalColumn),
              null != t.name &&
                ((n = this._names.indexOf(t.name)),
                (e += r.encode(n - l)),
                (l = n))),
            (d += e);
        }
        return d;
      }),
      (a.prototype._generateSourcesContent = function (e, t) {
        return e.map(function (e) {
          if (!this._sourcesContents) return null;
          null != t && (e = i.relative(t, e));
          var n = i.toSetString(e);
          return Object.prototype.hasOwnProperty.call(this._sourcesContents, n)
            ? this._sourcesContents[n]
            : null;
        }, this);
      }),
      (a.prototype.toJSON = function () {
        var e = {
          version: this._version,
          sources: this._sources.toArray(),
          names: this._names.toArray(),
          mappings: this._serializeMappings(),
        };
        return (
          null != this._file && (e.file = this._file),
          null != this._sourceRoot && (e.sourceRoot = this._sourceRoot),
          this._sourcesContents &&
            (e.sourcesContent = this._generateSourcesContent(
              e.sources,
              e.sourceRoot
            )),
          e
        );
      }),
      (a.prototype.toString = function () {
        return JSON.stringify(this.toJSON());
      }),
      (t.SourceMapGenerator = a);
  },
  "./node_modules/source-map/lib/source-node.js": function (e, t, n) {
    var r = n("./node_modules/source-map/lib/source-map-generator.js")
        .SourceMapGenerator,
      i = n("./node_modules/source-map/lib/util.js"),
      s = /(\r?\n)/,
      o = "$$$isSourceNode$$$";
    function a(e, t, n, r, i) {
      (this.children = []),
        (this.sourceContents = {}),
        (this.line = null == e ? null : e),
        (this.column = null == t ? null : t),
        (this.source = null == n ? null : n),
        (this.name = null == i ? null : i),
        (this[o] = !0),
        null != r && this.add(r);
    }
    (a.fromStringWithSourceMap = function (e, t, n) {
      var r = new a(),
        o = e.split(s),
        u = 0,
        c = function () {
          return e() + (e() || "");
          function e() {
            return u < o.length ? o[u++] : void 0;
          }
        },
        l = 1,
        h = 0,
        d = null;
      return (
        t.eachMapping(function (e) {
          if (null !== d) {
            if (!(l < e.generatedLine)) {
              var t = (n = o[u] || "").substr(0, e.generatedColumn - h);
              return (
                (o[u] = n.substr(e.generatedColumn - h)),
                (h = e.generatedColumn),
                p(d, t),
                void (d = e)
              );
            }
            p(d, c()), l++, (h = 0);
          }
          for (; l < e.generatedLine; ) r.add(c()), l++;
          if (h < e.generatedColumn) {
            var n = o[u] || "";
            r.add(n.substr(0, e.generatedColumn)),
              (o[u] = n.substr(e.generatedColumn)),
              (h = e.generatedColumn);
          }
          d = e;
        }, this),
        u < o.length && (d && p(d, c()), r.add(o.splice(u).join(""))),
        t.sources.forEach(function (e) {
          var s = t.sourceContentFor(e);
          null != s &&
            (null != n && (e = i.join(n, e)), r.setSourceContent(e, s));
        }),
        r
      );
      function p(e, t) {
        if (null === e || void 0 === e.source) r.add(t);
        else {
          var s = n ? i.join(n, e.source) : e.source;
          r.add(new a(e.originalLine, e.originalColumn, s, t, e.name));
        }
      }
    }),
      (a.prototype.add = function (e) {
        if (Array.isArray(e))
          e.forEach(function (e) {
            this.add(e);
          }, this);
        else {
          if (!e[o] && "string" != typeof e)
            throw new TypeError(
              "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " +
                e
            );
          e && this.children.push(e);
        }
        return this;
      }),
      (a.prototype.prepend = function (e) {
        if (Array.isArray(e))
          for (var t = e.length - 1; t >= 0; t--) this.prepend(e[t]);
        else {
          if (!e[o] && "string" != typeof e)
            throw new TypeError(
              "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " +
                e
            );
          this.children.unshift(e);
        }
        return this;
      }),
      (a.prototype.walk = function (e) {
        for (var t, n = 0, r = this.children.length; n < r; n++)
          (t = this.children[n])[o]
            ? t.walk(e)
            : "" !== t &&
              e(t, {
                source: this.source,
                line: this.line,
                column: this.column,
                name: this.name,
              });
      }),
      (a.prototype.join = function (e) {
        var t,
          n,
          r = this.children.length;
        if (r > 0) {
          for (t = [], n = 0; n < r - 1; n++)
            t.push(this.children[n]), t.push(e);
          t.push(this.children[n]), (this.children = t);
        }
        return this;
      }),
      (a.prototype.replaceRight = function (e, t) {
        var n = this.children[this.children.length - 1];
        return (
          n[o]
            ? n.replaceRight(e, t)
            : "string" == typeof n
            ? (this.children[this.children.length - 1] = n.replace(e, t))
            : this.children.push("".replace(e, t)),
          this
        );
      }),
      (a.prototype.setSourceContent = function (e, t) {
        this.sourceContents[i.toSetString(e)] = t;
      }),
      (a.prototype.walkSourceContents = function (e) {
        for (var t = 0, n = this.children.length; t < n; t++)
          this.children[t][o] && this.children[t].walkSourceContents(e);
        var r = Object.keys(this.sourceContents);
        for (t = 0, n = r.length; t < n; t++)
          e(i.fromSetString(r[t]), this.sourceContents[r[t]]);
      }),
      (a.prototype.toString = function () {
        var e = "";
        return (
          this.walk(function (t) {
            e += t;
          }),
          e
        );
      }),
      (a.prototype.toStringWithSourceMap = function (e) {
        var t = { code: "", line: 1, column: 0 },
          n = new r(e),
          i = !1,
          s = null,
          o = null,
          a = null,
          u = null;
        return (
          this.walk(function (e, r) {
            (t.code += e),
              null !== r.source && null !== r.line && null !== r.column
                ? ((s === r.source &&
                    o === r.line &&
                    a === r.column &&
                    u === r.name) ||
                    n.addMapping({
                      source: r.source,
                      original: { line: r.line, column: r.column },
                      generated: { line: t.line, column: t.column },
                      name: r.name,
                    }),
                  (s = r.source),
                  (o = r.line),
                  (a = r.column),
                  (u = r.name),
                  (i = !0))
                : i &&
                  (n.addMapping({
                    generated: { line: t.line, column: t.column },
                  }),
                  (s = null),
                  (i = !1));
            for (var c = 0, l = e.length; c < l; c++)
              10 === e.charCodeAt(c)
                ? (t.line++,
                  (t.column = 0),
                  c + 1 === l
                    ? ((s = null), (i = !1))
                    : i &&
                      n.addMapping({
                        source: r.source,
                        original: { line: r.line, column: r.column },
                        generated: { line: t.line, column: t.column },
                        name: r.name,
                      }))
                : t.column++;
          }),
          this.walkSourceContents(function (e, t) {
            n.setSourceContent(e, t);
          }),
          { code: t.code, map: n }
        );
      }),
      (t.SourceNode = a);
  },
  "./node_modules/source-map/lib/util.js": function (e, t) {
    t.getArg = function (e, t, n) {
      if (t in e) return e[t];
      if (3 === arguments.length) return n;
      throw new Error('"' + t + '" is a required argument.');
    };
    var n = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.-]*)(?::(\d+))?(.*)$/,
      r = /^data:.+\,.+$/;
    function i(e) {
      var t = e.match(n);
      return t
        ? { scheme: t[1], auth: t[2], host: t[3], port: t[4], path: t[5] }
        : null;
    }
    function s(e) {
      var t = "";
      return (
        e.scheme && (t += e.scheme + ":"),
        (t += "//"),
        e.auth && (t += e.auth + "@"),
        e.host && (t += e.host),
        e.port && (t += ":" + e.port),
        e.path && (t += e.path),
        t
      );
    }
    function o(e) {
      var n = e,
        r = i(e);
      if (r) {
        if (!r.path) return e;
        n = r.path;
      }
      for (
        var o, a = t.isAbsolute(n), u = n.split(/\/+/), c = 0, l = u.length - 1;
        l >= 0;
        l--
      )
        "." === (o = u[l])
          ? u.splice(l, 1)
          : ".." === o
          ? c++
          : c > 0 &&
            ("" === o ? (u.splice(l + 1, c), (c = 0)) : (u.splice(l, 2), c--));
      return (
        "" === (n = u.join("/")) && (n = a ? "/" : "."),
        r ? ((r.path = n), s(r)) : n
      );
    }
    function a(e, t) {
      "" === e && (e = "."), "" === t && (t = ".");
      var n = i(t),
        a = i(e);
      if ((a && (e = a.path || "/"), n && !n.scheme))
        return a && (n.scheme = a.scheme), s(n);
      if (n || t.match(r)) return t;
      if (a && !a.host && !a.path) return (a.host = t), s(a);
      var u = "/" === t.charAt(0) ? t : o(e.replace(/\/+$/, "") + "/" + t);
      return a ? ((a.path = u), s(a)) : u;
    }
    (t.urlParse = i),
      (t.urlGenerate = s),
      (t.normalize = o),
      (t.join = a),
      (t.isAbsolute = function (e) {
        return "/" === e.charAt(0) || n.test(e);
      }),
      (t.relative = function (e, t) {
        "" === e && (e = "."), (e = e.replace(/\/$/, ""));
        for (var n = 0; 0 !== t.indexOf(e + "/"); ) {
          var r = e.lastIndexOf("/");
          if (r < 0) return t;
          if ((e = e.slice(0, r)).match(/^([^\/]+:\/)?\/*$/)) return t;
          ++n;
        }
        return Array(n + 1).join("../") + t.substr(e.length + 1);
      });
    var u = !("__proto__" in Object.create(null));
    function c(e) {
      return e;
    }
    function l(e) {
      if (!e) return !1;
      var t = e.length;
      if (t < 9) return !1;
      if (
        95 !== e.charCodeAt(t - 1) ||
        95 !== e.charCodeAt(t - 2) ||
        111 !== e.charCodeAt(t - 3) ||
        116 !== e.charCodeAt(t - 4) ||
        111 !== e.charCodeAt(t - 5) ||
        114 !== e.charCodeAt(t - 6) ||
        112 !== e.charCodeAt(t - 7) ||
        95 !== e.charCodeAt(t - 8) ||
        95 !== e.charCodeAt(t - 9)
      )
        return !1;
      for (var n = t - 10; n >= 0; n--) if (36 !== e.charCodeAt(n)) return !1;
      return !0;
    }
    function h(e, t) {
      return e === t ? 0 : null === e ? 1 : null === t ? -1 : e > t ? 1 : -1;
    }
    (t.toSetString = u
      ? c
      : function (e) {
          return l(e) ? "$" + e : e;
        }),
      (t.fromSetString = u
        ? c
        : function (e) {
            return l(e) ? e.slice(1) : e;
          }),
      (t.compareByOriginalPositions = function (e, t, n) {
        var r = h(e.source, t.source);
        return 0 !== r ||
          0 !== (r = e.originalLine - t.originalLine) ||
          0 !== (r = e.originalColumn - t.originalColumn) ||
          n ||
          0 !== (r = e.generatedColumn - t.generatedColumn) ||
          0 !== (r = e.generatedLine - t.generatedLine)
          ? r
          : h(e.name, t.name);
      }),
      (t.compareByGeneratedPositionsDeflated = function (e, t, n) {
        var r = e.generatedLine - t.generatedLine;
        return 0 !== r ||
          0 !== (r = e.generatedColumn - t.generatedColumn) ||
          n ||
          0 !== (r = h(e.source, t.source)) ||
          0 !== (r = e.originalLine - t.originalLine) ||
          0 !== (r = e.originalColumn - t.originalColumn)
          ? r
          : h(e.name, t.name);
      }),
      (t.compareByGeneratedPositionsInflated = function (e, t) {
        var n = e.generatedLine - t.generatedLine;
        return 0 !== n ||
          0 !== (n = e.generatedColumn - t.generatedColumn) ||
          0 !== (n = h(e.source, t.source)) ||
          0 !== (n = e.originalLine - t.originalLine) ||
          0 !== (n = e.originalColumn - t.originalColumn)
          ? n
          : h(e.name, t.name);
      }),
      (t.parseSourceMapInput = function (e) {
        return JSON.parse(e.replace(/^\)]}'[^\n]*\n/, ""));
      }),
      (t.computeSourceURL = function (e, t, n) {
        if (
          ((t = t || ""),
          e &&
            ("/" !== e[e.length - 1] && "/" !== t[0] && (e += "/"),
            (t = e + t)),
          n)
        ) {
          var r = i(n);
          if (!r) throw new Error("sourceMapURL could not be parsed");
          if (r.path) {
            var u = r.path.lastIndexOf("/");
            u >= 0 && (r.path = r.path.substring(0, u + 1));
          }
          t = a(s(r), t);
        }
        return o(t);
      });
  },
  "./node_modules/source-map/source-map.js": function (e, t, n) {
    (t.SourceMapGenerator = n(
      "./node_modules/source-map/lib/source-map-generator.js"
    ).SourceMapGenerator),
      (t.SourceMapConsumer = n(
        "./node_modules/source-map/lib/source-map-consumer.js"
      ).SourceMapConsumer),
      (t.SourceNode = n(
        "./node_modules/source-map/lib/source-node.js"
      ).SourceNode);
  },
  "./node_modules/supports-color/index.js": function (e, t, n) {
    "use strict";
    const r = n("os"),
      i = n("tty"),
      s = n("./node_modules/supports-color/node_modules/has-flag/index.js"),
      { env: o } = process;
    let a;
    function u(e) {
      return (
        0 !== e && { level: e, hasBasic: !0, has256: e >= 2, has16m: e >= 3 }
      );
    }
    function c(e, t) {
      if (0 === a) return 0;
      if (s("color=16m") || s("color=full") || s("color=truecolor")) return 3;
      if (s("color=256")) return 2;
      if (e && !t && void 0 === a) return 0;
      const n = a || 0;
      if ("dumb" === o.TERM) return n;
      if ("win32" === process.platform) {
        const e = r.release().split(".");
        return Number(e[0]) >= 10 && Number(e[2]) >= 10586
          ? Number(e[2]) >= 14931
            ? 3
            : 2
          : 1;
      }
      if ("CI" in o)
        return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI"].some(
          (e) => e in o
        ) || "codeship" === o.CI_NAME
          ? 1
          : n;
      if ("TEAMCITY_VERSION" in o)
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(o.TEAMCITY_VERSION) ? 1 : 0;
      if ("GITHUB_ACTIONS" in o) return 1;
      if ("truecolor" === o.COLORTERM) return 3;
      if ("TERM_PROGRAM" in o) {
        const e = parseInt((o.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (o.TERM_PROGRAM) {
          case "iTerm.app":
            return e >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      return /-256(color)?$/i.test(o.TERM)
        ? 2
        : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(
            o.TERM
          ) || "COLORTERM" in o
        ? 1
        : n;
    }
    s("no-color") || s("no-colors") || s("color=false") || s("color=never")
      ? (a = 0)
      : (s("color") || s("colors") || s("color=true") || s("color=always")) &&
        (a = 1),
      "FORCE_COLOR" in o &&
        (a =
          "true" === o.FORCE_COLOR
            ? 1
            : "false" === o.FORCE_COLOR
            ? 0
            : 0 === o.FORCE_COLOR.length
            ? 1
            : Math.min(parseInt(o.FORCE_COLOR, 10), 3)),
      (e.exports = {
        supportsColor: function (e) {
          return u(c(e, e && e.isTTY));
        },
        stdout: u(c(!0, i.isatty(1))),
        stderr: u(c(!0, i.isatty(2))),
      });
  },
  "./node_modules/supports-color/node_modules/has-flag/index.js": function (
    e,
    t,
    n
  ) {
    "use strict";
    e.exports = (e, t = process.argv) => {
      const n = e.startsWith("-") ? "" : 1 === e.length ? "-" : "--",
        r = t.indexOf(n + e),
        i = t.indexOf("--");
      return -1 !== r && (-1 === i || r < i);
    };
  },
  "./node_modules/webpack/buildin/module.js": function (e, t) {
    e.exports = function (e) {
      return (
        e.webpackPolyfill ||
          ((e.deprecate = function () {}),
          (e.paths = []),
          e.children || (e.children = []),
          Object.defineProperty(e, "loaded", {
            enumerable: !0,
            get: function () {
              return e.l;
            },
          }),
          Object.defineProperty(e, "id", {
            enumerable: !0,
            get: function () {
              return e.i;
            },
          }),
          (e.webpackPolyfill = 1)),
        e
      );
    };
  },
  "./node_modules/wrappy/wrappy.js": function (e, t) {
    e.exports = function e(t, n) {
      if (t && n) return e(t)(n);
      if ("function" != typeof t) throw new TypeError("need wrapper function");
      return (
        Object.keys(t).forEach(function (e) {
          r[e] = t[e];
        }),
        r
      );
      function r() {
        for (var e = new Array(arguments.length), n = 0; n < e.length; n++)
          e[n] = arguments[n];
        var r = t.apply(this, e),
          i = e[e.length - 1];
        return (
          "function" == typeof r &&
            r !== i &&
            Object.keys(i).forEach(function (e) {
              r[e] = i[e];
            }),
          r
        );
      }
    };
  },
  assert: function (e, t) {
    e.exports = require("assert");
  },
  buffer: function (e, t) {
    e.exports = require("buffer");
  },
  child_process: function (e, t) {
    e.exports = require("child_process");
  },
  constants: function (e, t) {
    e.exports = require("constants");
  },
  crypto: function (e, t) {
    e.exports = require("crypto");
  },
  electron: function (e, t) {
    e.exports = require("electron");
  },
  events: function (e, t) {
    e.exports = require("events");
  },
  fs: function (e, t) {
    e.exports = require("fs");
  },
  http: function (e, t) {
    e.exports = require("http");
  },
  https: function (e, t) {
    e.exports = require("https");
  },
  os: function (e, t) {
    e.exports = require("os");
  },
  path: function (e, t) {
    e.exports = require("path");
  },
  querystring: function (e, t) {
    e.exports = require("querystring");
  },
  stream: function (e, t) {
    e.exports = require("stream");
  },
  string_decoder: function (e, t) {
    e.exports = require("string_decoder");
  },
  tty: function (e, t) {
    e.exports = require("tty");
  },
  url: function (e, t) {
    e.exports = require("url");
  },
  util: function (e, t) {
    e.exports = require("util");
  },
  zlib: function (e, t) {
    e.exports = require("zlib");
  },
});
