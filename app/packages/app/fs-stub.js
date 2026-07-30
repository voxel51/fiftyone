/* global module */
// Browser stand-in for node:fs. Packages that probe for fs at import time
// (protobufjs, @foxglove/wasm-*) get an empty object and take their browser
// fallback, instead of vite's externalization proxy that warns per access.
module.exports = {};
