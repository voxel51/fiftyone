export interface State {
  hasMore: boolean;
  isLoading: boolean;
  loadMore: boolean;
  pageToLoad: number | null;
}

interface RowStyle {
  display: string;
  gridTemplateColumns: string;
  width: string;
  margin: number;
}

interface Row {
  style: RowStyle;
  columns: number;
  samples: string[];
  aspectRatio: number;
  extraMargins: number;
}

interface Rows {
  rows: Row[];
  remainder: Sample[];
}

interface Sample {
  width: number;
  height: number;
  aspect_ratio: number;
}

const lastRowRefWidth = (
  row: Sample[],
  threshold: number
): [number, number] => {
  const baseAspectRatio = row[0].aspect_ratio;
  const sameAspectRatios = row
    .slice(1)
    .every((i) => baseAspectRatio === i.aspect_ratio);

  if (sameAspectRatios) {
    let currentAR = row[0].aspect_ratio;
    let extraMargins = 0;
    while (currentAR < threshold) {
      currentAR += row[0].aspect_ratio;
      extraMargins += 1;
    }
    return [currentAR, extraMargins];
  } else {
    return [threshold, 0];
  }
};

export default function tile(
  data: Sample[],
  newHasMore: boolean,
  state: State,
  { rows, remainder: oldRemainder }: Rows,
  rowAspectRatioThreshold: number
): [State, Rows] {
  const samplesToFit = [...oldRemainder, ...data];
  rows = [...rows];
  const newRows = [];
  let currentRow = [];
  let currentAR = null;
  for (const i in samplesToFit) {
    const s = samplesToFit[i];
    if (currentAR === null) {
      currentAR = s.aspect_ratio;
      currentRow.push(s);
      continue;
    }

    if (currentAR >= rowAspectRatioThreshold) {
      newRows.push(currentRow);
      currentRow = [s];
      currentAR += s.aspect_ratio;
      continue;
    }
    currentRow.push(s);
  }

  let remainder = [];
  if (!Boolean(newHasMore) && currentRow.length) newRows.push(currentRow);
  else remainder = currentRow;

  for (const i in newRows) {
    const row = newRows[i];
    const columns = [];
    const [refWidth, extraMargins] =
      !Boolean(newHasMore) &&
      i === String(newRows.length - 1) &&
      currentAR < rowAspectRatioThreshold
        ? lastRowRefWidth(row, rowAspectRatioThreshold)
        : [currentAR, 0];

    for (const { aspect_ratio } of row) {
      columns.push(aspect_ratio / refWidth);
    }

    let gridColumns = columns
      .map((c) => {
        return (
          (c * (100 - (columns.length - 1 + extraMargins) / 5)).toFixed(2) + "%"
        );
      })
      .reduce((acc, cur, i) => {
        if (i < columns.length - 1) {
          return [...acc, cur, "0.2%"];
        }
        return [...acc, cur];
      }, []);

    gridColumns = gridColumns.concat(
      Array.from(Array(extraMargins).keys()).map(() => "0.2%")
    );
    const gridColumnsLength = gridColumns.length;
    const rowStyle = {
      display: "grid",
      gridTemplateColumns: gridColumns.join(" "),
      width: "100%",
      margin: 0,
    };

    rows.push({
      style: rowStyle,
      columns: gridColumnsLength,
      samples: row.map((s) => s.sample._id),
      aspectRatio:
        refWidth + ((columns.length - 1 + extraMargins) / 5) * (refWidth / 100),
      extraMargins,
    });
  }

  return [
    {
      hasMore: Boolean(newHasMore),
      isLoading: false,
      loadMore: false,
      pageToLoad: state.pageToLoad,
    },
    { rows, remainder },
  ];
}
