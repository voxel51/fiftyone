const OBJECT_CLASS_CACHE = {};

const objectClass = (object: object) => {
  const prototype = Object.prototype.toString.call(object);
  if (!OBJECT_CLASS_CACHE[prototype]) {
    OBJECT_CLASS_CACHE[prototype] = prototype.slice(8, -1);
  }
  return OBJECT_CLASS_CACHE[prototype];
};

const isObject = (object: object) => {
  const oClass = objectClass(object);
  return oClass === "Object" || oClass === "Array";
};

type SizeTypes = boolean | null | number | object | string | undefined;

type SizerTypes = SizeTypes | Array<SizeTypes>;

const sizer = (object: SizerTypes) => {
  if (object === null || object === undefined) {
    return 1;
  }

  if (typeof ImageBitmap !== "undefined" && object instanceof ImageBitmap) {
    return object.height * object.width * 4;
  }

  if (object instanceof ArrayBuffer) {
    return object.byteLength;
  }

  if (typeof object === "boolean") {
    // Assume 8
    return 8;
  }

  if (typeof object === "number") {
    // Assume 8
    return 8;
  }

  if (typeof object === "string") {
    // 2 bytes per character
    return object.length * 2;
  }

  if (typeof object !== "object" || !isObject(object)) {
    // Give up
    return 0;
  }

  if (!Array.isArray(object)) {
    let size = 0;
    for (const key in object) {
      size += sizer(object[key]) + sizer(key);
    }
    return size;
  }

  const array: SizerTypes[] = object;

  let size = 0;
  for (const value of array) {
    size += sizer(value);
  }
  return size;
};

export default function sizeBytesEstimate(object: SizeTypes) {
  // return value > 0;
  return Math.max(sizer(object), 1);
}
