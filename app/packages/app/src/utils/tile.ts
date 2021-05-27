export interface State {
  hasMore: boolean;
  isLoading: boolean;
  loadMore: boolean;
  pageToLoad: number | null;
}

interface Row {
  samples: { id: string; aspectRatio: number };
  aspectRatio: number;
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

  let margins = 0;
  if (sameAspectRatios) {
    let currentAR = row[0].aspect_ratio;
    while (currentAR < threshold) {
      currentAR += row[0].aspect_ratio;
      margins += 1;
    }
    return [currentAR, margins];
  } else {
    return [threshold, margins];
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
      currentAR = s.aspect_ratio;
      continue;
    }

    currentAR += s.aspect_ratio;
    currentRow.push(s);
  }

  let remainder = [];
  if (!Boolean(newHasMore) && currentRow.length) newRows.push(currentRow);
  else remainder = currentRow;

  for (const i in newRows) {
    const row = newRows[i];
    const [ar] =
      !Boolean(newHasMore) &&
      i === String(newRows.length - 1) &&
      currentAR < rowAspectRatioThreshold
        ? lastRowRefWidth(row, rowAspectRatioThreshold)
        : [currentAR, 0];

    rows.push({
      samples: row.map((s) => ({
        id: s.sample._id,
        aspectRatio: s.aspect_ratio,
      })),
      aspectRatio: ar,
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
