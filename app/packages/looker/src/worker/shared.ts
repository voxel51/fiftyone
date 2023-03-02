/**
 * Map the _id field to id
 */
export const mapId = (obj) => {
  if (obj && obj._id !== undefined) {
    obj.id = obj._id;
    delete obj._id;
  }
  return obj;
};
