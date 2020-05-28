import { expose } from "comlink";
import tile from "../../utils/tile";

const exports = {
  tile,
};
export type Tiler = typeof exports;

expose(exports);
