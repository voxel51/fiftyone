import { GetRecoilValue } from "recoil";
import { field as fieldAtom, fieldPaths, meetsType } from "../schema";

export const gatherPaths = (
  get: GetRecoilValue,
  ftype: string | string[],
  embeddedDocType?: string | string[]
) => {
  const paths = [];

  const recurseFields = (path) => {
    const field = get(fieldAtom(path));

    if (get(meetsType({ path, ftype, embeddedDocType }))) {
      paths.push(path);
    }
    if (field.fields) {
      Object.keys(field.fields).forEach((name) =>
        recurseFields(`${path}.${name}`)
      );
    }
  };

  const schema = get(fieldPaths({}));
  for (const path of schema) recurseFields(path);
  return paths;
};
