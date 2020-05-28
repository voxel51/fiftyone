import { expose } from "comlink";

function tile(state) {
  console.log("working");
  console.log(state);
  return "hello";
}

const exports = {
  tile,
};
export type Tiler = typeof exports;

expose(exports);
