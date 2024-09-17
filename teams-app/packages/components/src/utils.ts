// common helper functions

// get the first two letter initials of a name
export const getInitials = (name: string) => {
  if (name.startsWith('+')) return name;
  if (typeof name !== 'string') return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
};

// generate a unique avatar color based on the name
export const stringToColor = (text: string) => {
  let hash = 0;
  let i;
  // in case the text is empty, use 'default' as the name
  const name = text && text.length ? text : 'default';

  /* eslint-disable no-bitwise */
  for (i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  let color = '#';

  for (i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff;
    color += `00${value.toString(16)}`.slice(-2);
  }
  /* eslint-enable no-bitwise */

  return color;
};
