const MIDDLE_ITEM_SEPARATOR = ', ';
const LAST_ITEM_SEPARATOR = ', and ';
const TUPLE_SEPARATOR = ' and ';

export function formatListWithCount(items: Array<ListWithCountItem>) {
  return items.reduce((list, item, i) => {
    const { label, pluralLabel, amount } = item;
    const computedLabel = amount === 1 ? label : pluralLabel || `${label}s`;
    let separator = '';
    if (i > 0) {
      if (items.length === 2) separator = TUPLE_SEPARATOR;
      else if (items.length >= 2) {
        if (i === items.length - 1) {
          separator = LAST_ITEM_SEPARATOR;
        } else {
          separator = MIDDLE_ITEM_SEPARATOR;
        }
      }
    }

    return `${list}${separator}${amount} ${computedLabel}`;
  }, '');
}

export function pluralize(
  number: number,
  singular: string | JSX.Element,
  plural?: string | JSX.Element
) {
  const fallbackPlural =
    typeof singular === 'string' ? `${singular}s` : singular;
  return number === 1 ? singular : plural || fallbackPlural;
}

export function labelWithCount(
  number: number,
  singularLabel: string | JSX.Element,
  pluralLabel?: string | JSX.Element
) {
  return `${number} ${pluralize(number, singularLabel, pluralLabel)}`;
}

export type ListWithCountItem = {
  label: string;
  pluralLabel?: string;
  amount: number;
};
