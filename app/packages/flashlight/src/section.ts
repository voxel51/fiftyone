import { MARGIN } from "./constants";
import Row, { ItemData } from "./row";
import { flashlightSection } from "./styles.module.css";
import tile from "./tile";

export interface Response<K> {
  items: ItemData[];
  next: K | null;
  previous: K | null;
}

interface Edge<K> {
  key?: K;
  remainder: ItemData[];
}

export class Section<K> {
  #shown: Set<Row> = new Set();

  readonly #container = document.createElement("div");
  readonly #section = document.createElement("div");
  #start: Edge<K>;
  #end: Edge<K>;
  #rows: Row[] = [];
  constructor(
    key: K,
    private readonly threshold: number,
    private readonly width: number
  ) {
    this.#start = {
      key,
      remainder: [],
    };
    this.#end = this.#start;
    this.#container.classList.add(flashlightSection);

    this.#section.classList.add(flashlightSection);
    this.#section.appendChild(this.#container);
  }

  get length() {
    return this.#rows.length;
  }

  get height() {
    if (!this.#rows.length) return 0;

    const row = this.#rows[this.length - 1];

    return row.from + row.height + MARGIN;
  }

  attach(element: HTMLDivElement) {
    element.appendChild(this.#section);
  }

  async #next(get: Get<K>) {
    const end = this.#end;
    this.#end = undefined;

    const data = await get(end.key);
    const { rows, remainder } = this.#tile(
      [...end.remainder, ...data.items],
      this.height
    );
    this.#end =
      data.next !== null
        ? {
            key: data.next,
            remainder,
          }
        : undefined;
    this.#rows.push(...rows);

    if (this.#end && this.#rows.length > 10) {
      this.#rows = [];
      this.#start = { key: data.next, remainder: [] };
      this.#end = { key: data.next, remainder };
    }
  }

  #tile(
    items: ItemData[],
    from: number,
    reverse = false
  ): { rows: Row[]; remainder: ItemData[]; offset: number } {
    const data = items.map(({ aspectRatio }) => aspectRatio);
    const breakpoints = tile(data, this.threshold);

    let previous = 0;
    let offset = 0;
    const rows: Row[] = [];
    for (let index = 0; index < breakpoints.length; index++) {
      const rowItems = items.slice(previous, breakpoints[index]);

      if (reverse) {
        rowItems.reverse();
      }

      const row = new Row(rowItems, from + offset, this.width);
      rows.push(row);
      offset += row.height + MARGIN;
      previous = breakpoints[index];
    }

    const remainder = items.slice(breakpoints[breakpoints.length - 1]);

    return { rows, remainder, offset };
  }
}
