export const packageMessage = (type, data) => {
  return JSON.stringify({
    ...data,
    type,
  });
};
