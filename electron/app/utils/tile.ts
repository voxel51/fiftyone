const THRESHOLD = 5;

const lastRowRefWidth = (row) => {
  const baseAspectRatio = row[0].width / row[0].height;
  const sameAspectRatios = row
    .slice(1)
    .every((i) => baseAspectRatio === i.width / i.height);

  if (sameAspectRatios) {
    let currentWidth = row[0].width;
    const currentHeight = row[0].height;
    let extraMargins = 0;
    while (currentWidth / currentHeight < THRESHOLD) {
      currentWidth += row[0].width;
      extraMargins += 1;
    }
    return [currentWidth, extraMargins];
  } else {
    return [row[0].height * THRESHOLD, 0];
  }
};

export default function tile(data, newHasMore, state) {
  const samplesToFit = [...state.remainder, ...data];
  const rows = [...state.rows];
  const newRows = [];
  let currentRow = [];
  let currentWidth = null;
  let currentHeight = null;
  for (const i in samplesToFit) {
    const s = samplesToFit[i];
    if (currentWidth === null) {
      currentWidth = s.width;
      currentHeight = s.height;
      currentRow.push(s);
      continue;
    }

    if (currentWidth / currentHeight >= THRESHOLD) {
      newRows.push(currentRow);
      currentRow = [s];
      currentWidth = s.width;
      currentHeight = s.height;
      continue;
    }
    currentRow.push(s);
    currentWidth += (currentHeight / s.height) * s.width;
  }

  let remainder = [];
  if (!Boolean(newHasMore) && currentRow.length) newRows.push(currentRow);
  else remainder = currentRow;

  for (const i in newRows) {
    const row = newRows[i];
    const columns = [];
    const baseHeight = row[0].height;
    const [refWidth, extraMargins] =
      !Boolean(newHasMore) &&
      i === String(newRows.length - 1) &&
      currentWidth / currentHeight < THRESHOLD
        ? lastRowRefWidth(row)
        : [
            row.reduce(
              (acc, val) => acc + (baseHeight / val.height) * val.width,
              0
            ),
            0,
          ];

    for (const sample of row) {
      const sampleWidth = (baseHeight * sample.width) / sample.height;
      columns.push(sampleWidth / refWidth);
    }

    let gridColumns = columns
      .map((c) => {
        return (
          (c * (100 - (columns.length - 1 + extraMargins) / 2)).toFixed(2) + "%"
        );
      })
      .reduce((acc, cur, i) => {
        if (i < columns.length - 1) {
          return [...acc, cur, "0.5%"];
        }
        return [...acc, cur];
      }, []);

    gridColumns = gridColumns.concat(
      Array.from(Array(extraMargins).keys()).map(() => "0.5%")
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
      samples: row.map(({ sample, ...rest }) => ({ sample, metadata: rest })),
      aspectRatio:
        (refWidth +
          ((columns.length - 1 + extraMargins) / 2) * (refWidth / 100)) /
        baseHeight,
      extraMargins,
    });
  }
  return {
    hasMore: Boolean(newHasMore),
    rows: rows,
    isLoading: false,
    loadMore: false,
    remainder: remainder,
    pageToLoad: Boolean(newHasMore) ? newHasMore : state.pageToLoad,
  };
}
