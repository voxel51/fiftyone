import numeral from 'numeral';

export default function formatNumber(number, format = '0.[0]a') {
  return numeral(number).format(format);
}
