/**
 * Filter out empty arrays that weren't in the original data
 * i.e. don't add `tags: []` if `tags` does not already exist on props.data
 */
export function filterEmptyArrays(
  formData: Record<string, unknown>,
  originalData: Record<string, unknown>
) {
  const filteredData = { ...formData };
  Object.entries(filteredData).forEach(([key, value]) => {
    if (!(key in originalData) && Array.isArray(value) && value.length === 0) {
      delete filteredData[key];
    }
  });
  return filteredData;
}
