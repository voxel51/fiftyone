import { loadedMcapDecompressHandler } from "../../compatibility/mcap-support";

const CLOUDINI_MAGIC = "CLOUDINI_V";
const CLOUDINI_POINTS_PER_CHUNK = 32 * 1024;
const MAX_CLOUDINI_DECODED_BYTES = 512 * 1024 * 1024;
const TEXT_DECODER = new TextDecoder();

const CLOUDINI_FIELD_SIZES = {
  FLOAT32: 4,
  FLOAT64: 8,
  INT16: 2,
  INT32: 4,
  INT64: 8,
  INT8: 1,
  UINT16: 2,
  UINT32: 4,
  UINT64: 8,
  UINT8: 1,
} as const;

type CloudiniCompression = "LZ4" | "NONE" | "ZSTD";
type CloudiniEncoding = "LOSSLESS" | "LOSSY" | "NONE";
type CloudiniFieldType = keyof typeof CLOUDINI_FIELD_SIZES;

export interface CloudiniHeader {
  readonly compression: CloudiniCompression;
  readonly encoding: CloudiniEncoding;
  readonly fields: readonly CloudiniField[];
  readonly height: number;
  readonly pointStep: number;
  readonly version: 3;
  readonly width: number;
}

interface CloudiniField {
  readonly name: string;
  readonly offset: number;
  readonly resolution?: number;
  readonly type: CloudiniFieldType;
}

interface ParsedCloudiniHeader {
  readonly dataOffset: number;
  readonly header: CloudiniHeader;
}

interface CloudiniFieldDecoder {
  readonly maxInputBytes: number;
  decode(input: ByteCursor, output: CloudiniOutput, pointOffset: number): void;
  reset(): void;
}

interface CloudiniOutput {
  readonly bytes: Uint8Array;
  readonly view: DataView;
}

/**
 * Decodes the Cloudini v3 payload used by CompressedPointCloud2 messages.
 *
 * The field codec mirrors Cloudini's Apache-2.0-licensed v3 wire format. MCAP's
 * already-loaded browser decompressors handle the optional LZ4/Zstd chunk
 * layer, so this does not add a second WASM runtime to the application.
 */
export function decodeCloudiniPointCloud(bytes: Uint8Array): {
  readonly data: Uint8Array;
  readonly header: CloudiniHeader;
} {
  const { dataOffset, header } = parseCloudiniHeader(bytes);
  const pointCount = checkedProduct(
    header.width,
    header.height,
    "Cloudini point count",
  );
  const outputByteLength = checkedProduct(
    pointCount,
    header.pointStep,
    "Cloudini decoded byte length",
  );
  if (outputByteLength > MAX_CLOUDINI_DECODED_BYTES) {
    throw new Error(
      `Cloudini decoded byte length ${outputByteLength} exceeds the ${MAX_CLOUDINI_DECODED_BYTES}-byte limit`,
    );
  }
  const output = new Uint8Array(outputByteLength);
  const outputView = new DataView(
    output.buffer,
    output.byteOffset,
    output.byteLength,
  );
  const outputBuffer = { bytes: output, view: outputView };
  const fieldDecoders = buildFieldDecoders(header);
  const maxEncodedPointBytes = fieldDecoders.reduce(
    (total, decoder) => total + decoder.maxInputBytes,
    0,
  );

  let encodedOffset = dataOffset;
  let outputPointOffset = 0;
  let pointsRemaining = pointCount;
  while (encodedOffset < bytes.byteLength) {
    if (pointsRemaining === 0) {
      throw new Error(
        "Cloudini data contains more chunks than declared points",
      );
    }
    if (encodedOffset + 4 > bytes.byteLength) {
      throw new Error("Cloudini data ends in a truncated chunk size");
    }

    const chunkSize = new DataView(
      bytes.buffer,
      bytes.byteOffset + encodedOffset,
      4,
    ).getUint32(0, true);
    encodedOffset += 4;
    if (chunkSize === 0 || encodedOffset + chunkSize > bytes.byteLength) {
      throw new Error(`Invalid Cloudini chunk size ${chunkSize}`);
    }

    const pointsInChunk = Math.min(pointsRemaining, CLOUDINI_POINTS_PER_CHUNK);
    const maxStageBytes = checkedProduct(
      pointsInChunk,
      maxEncodedPointBytes,
      "Cloudini stage byte length",
    );
    if (maxStageBytes > MAX_CLOUDINI_DECODED_BYTES) {
      throw new Error(
        `Cloudini stage byte length ${maxStageBytes} exceeds the ${MAX_CLOUDINI_DECODED_BYTES}-byte limit`,
      );
    }
    const compressedChunk = bytes.subarray(
      encodedOffset,
      encodedOffset + chunkSize,
    );
    const stage = decompressCloudiniChunk(
      compressedChunk,
      header.compression,
      maxStageBytes,
    );
    const input = new ByteCursor(stage);
    for (const decoder of fieldDecoders) {
      decoder.reset();
    }

    for (let point = 0; point < pointsInChunk; point++) {
      for (const decoder of fieldDecoders) {
        decoder.decode(input, outputBuffer, outputPointOffset);
      }
      outputPointOffset += header.pointStep;
    }

    encodedOffset += chunkSize;
    pointsRemaining -= pointsInChunk;
  }

  if (pointsRemaining !== 0) {
    throw new Error(
      "Cloudini data ended before all declared points were decoded",
    );
  }

  return { data: output, header };
}

function parseCloudiniHeader(bytes: Uint8Array): ParsedCloudiniHeader {
  const minimumHeaderBytes = CLOUDINI_MAGIC.length + 3;
  if (bytes.byteLength < minimumHeaderBytes) {
    throw new Error("Input is too small to contain a Cloudini header");
  }

  const magic = TEXT_DECODER.decode(bytes.subarray(0, CLOUDINI_MAGIC.length));
  if (magic !== CLOUDINI_MAGIC) {
    throw new Error(`Invalid Cloudini magic header '${magic}'`);
  }

  const versionText = TEXT_DECODER.decode(
    bytes.subarray(CLOUDINI_MAGIC.length, CLOUDINI_MAGIC.length + 2),
  );
  if (!/^\d{2}$/.test(versionText)) {
    throw new Error(`Invalid Cloudini version '${versionText}'`);
  }
  const version = Number(versionText);
  if (version !== 3) {
    throw new Error(
      `Unsupported Cloudini version ${version}; expected version 3`,
    );
  }

  const yamlStart = CLOUDINI_MAGIC.length + 2;
  if (bytes[yamlStart] !== 0x0a) {
    throw new Error("Unsupported Cloudini v3 binary header");
  }
  const yamlEnd = bytes.indexOf(0, yamlStart + 1);
  if (yamlEnd < 0) {
    throw new Error("Cloudini YAML header is missing its null terminator");
  }

  const yaml = TEXT_DECODER.decode(bytes.subarray(yamlStart + 1, yamlEnd));
  return {
    dataOffset: yamlEnd + 1,
    header: parseCloudiniYamlHeader(yaml),
  };
}

function parseCloudiniYamlHeader(yaml: string): CloudiniHeader {
  const properties = new Map<string, string>();
  const fields: MutableCloudiniField[] = [];
  let currentField: MutableCloudiniField | undefined;

  for (const rawLine of yaml.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const fieldStart = /^ {2}- name:\s*(.*)$/.exec(line);
    if (fieldStart) {
      currentField = { name: yamlString(fieldStart[1]) };
      fields.push(currentField);
      continue;
    }

    const fieldProperty = /^ {4}([a-z_]+):\s*(.*)$/.exec(line);
    if (fieldProperty && currentField) {
      currentField[fieldProperty[1]] = fieldProperty[2].trim();
      continue;
    }

    const property = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (property) {
      properties.set(property[1], property[2].trim());
    }
  }

  const headerVersion = requiredInteger(properties, "version");
  if (headerVersion !== 3) {
    throw new Error(
      `Cloudini YAML version ${headerVersion} does not match version 3`,
    );
  }
  const width = requiredInteger(properties, "width");
  const height = requiredInteger(properties, "height");
  const pointStep = requiredInteger(properties, "point_step");
  const encoding = requiredEnum(properties, "encoding_opt", [
    "LOSSLESS",
    "LOSSY",
    "NONE",
  ] as const);
  const compression = requiredEnum(properties, "compression_opt", [
    "LZ4",
    "NONE",
    "ZSTD",
  ] as const);
  if (pointStep <= 0) {
    throw new Error(`Invalid Cloudini point_step ${pointStep}`);
  }
  if (fields.length === 0 && width * height > 0) {
    throw new Error("Cloudini header does not declare any fields");
  }

  const parsedFields = fields.map((field): CloudiniField => {
    const name = field.name?.trim();
    if (!name) {
      throw new Error("Cloudini field is missing a name");
    }
    const offset = integerText(field.offset, `Cloudini field '${name}' offset`);
    const type = fieldType(field.type, name);
    const resolution = resolutionText(field.resolution, name);
    const fieldEnd = offset + CLOUDINI_FIELD_SIZES[type];
    if (fieldEnd > pointStep) {
      throw new Error(
        `Cloudini field '${name}' ends at ${fieldEnd}, past point_step ${pointStep}`,
      );
    }
    return {
      name,
      offset,
      ...(resolution === undefined ? {} : { resolution }),
      type,
    };
  });

  return {
    compression,
    encoding,
    fields: parsedFields,
    height,
    pointStep,
    version: 3,
    width,
  };
}

interface MutableCloudiniField {
  [key: string]: string | undefined;
  name?: string;
  offset?: string;
  resolution?: string;
  type?: string;
}

function yamlString(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function requiredInteger(
  properties: ReadonlyMap<string, string>,
  name: string,
): number {
  return integerText(properties.get(name), `Cloudini ${name}`);
}

function integerText(value: string | undefined, label: string): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is not a non-negative integer`);
  }
  return parsed;
}

function requiredEnum<Value extends string>(
  properties: ReadonlyMap<string, string>,
  name: string,
  values: readonly Value[],
): Value {
  const value = properties.get(name);
  if (!value || !values.includes(value as Value)) {
    throw new Error(`Invalid Cloudini ${name} '${value ?? ""}'`);
  }
  return value as Value;
}

function fieldType(
  value: string | undefined,
  fieldName: string,
): CloudiniFieldType {
  if (value && value in CLOUDINI_FIELD_SIZES) {
    return value as CloudiniFieldType;
  }
  throw new Error(
    `Invalid type '${value ?? ""}' for Cloudini field '${fieldName}'`,
  );
}

function resolutionText(
  value: string | undefined,
  fieldName: string,
): number | undefined {
  if (value === undefined || value === "null") {
    return undefined;
  }
  const resolution = Number(value);
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error(
      `Invalid resolution '${value}' for Cloudini field '${fieldName}'`,
    );
  }
  return resolution;
}

function checkedProduct(left: number, right: number, label: string): number {
  const product = left * right;
  if (!Number.isSafeInteger(product) || product < 0) {
    throw new Error(`${label} is too large`);
  }
  return product;
}

function decompressCloudiniChunk(
  chunk: Uint8Array,
  compression: CloudiniCompression,
  maxStageBytes: number,
): Uint8Array {
  if (compression === "NONE") {
    return chunk;
  }
  const handler = loadedMcapDecompressHandler(compression.toLowerCase());
  return handler(chunk, BigInt(maxStageBytes));
}

function buildFieldDecoders(
  header: CloudiniHeader,
): readonly CloudiniFieldDecoder[] {
  if (header.encoding === "NONE") {
    return header.fields.map(copyFieldDecoder);
  }

  const decoders: CloudiniFieldDecoder[] = [];
  const leadingLossyFloatCount = countLeadingLossyFloats(header);
  if (leadingLossyFloatCount > 0) {
    decoders.push(
      lossyFloatGroupDecoder(header.fields.slice(0, leadingLossyFloatCount)),
    );
  }

  for (const field of header.fields.slice(leadingLossyFloatCount)) {
    decoders.push(compatibleFieldDecoder(header, field));
  }
  return decoders;
}

function countLeadingLossyFloats(header: CloudiniHeader): number {
  if (header.encoding !== "LOSSY") {
    return 0;
  }
  let count = 0;
  for (const field of header.fields) {
    if (field.type !== "FLOAT32" || field.resolution === undefined) {
      break;
    }
    count++;
  }
  return count === 3 || count === 4 ? count : 0;
}

function compatibleFieldDecoder(
  header: CloudiniHeader,
  field: CloudiniField,
): CloudiniFieldDecoder {
  if (field.type === "FLOAT32") {
    if (header.encoding === "LOSSY" && field.resolution !== undefined) {
      return lossyFloatDecoder(field, false);
    }
    if (header.encoding === "LOSSLESS") {
      return xorFloatDecoder(field, false);
    }
    if (field.resolution !== undefined) {
      return lossyFloatDecoder(field, false);
    }
    return copyFieldDecoder(field);
  }
  if (field.type === "FLOAT64") {
    if (field.resolution !== undefined && header.encoding !== "LOSSLESS") {
      return lossyFloatDecoder(field, true);
    }
    return xorFloatDecoder(field, true);
  }
  if (field.type === "INT8" || field.type === "UINT8") {
    return copyFieldDecoder(field);
  }
  return integerFieldDecoder(field);
}

function copyFieldDecoder(field: CloudiniField): CloudiniFieldDecoder {
  const size = CLOUDINI_FIELD_SIZES[field.type];
  return {
    maxInputBytes: size,
    decode(input, output, pointOffset) {
      input.copyTo(output, pointOffset + field.offset, size);
    },
    reset: resetCopyDecoder,
  };
}

function resetCopyDecoder(): void {
  return undefined;
}

function integerFieldDecoder(field: CloudiniField): CloudiniFieldDecoder {
  if (field.type !== "INT64" && field.type !== "UINT64") {
    return integerNumberFieldDecoder(field);
  }

  let previous = 0n;
  return {
    maxInputBytes: 10,
    decode(input, output, pointOffset) {
      const diff = input.varint();
      previous = BigInt.asIntN(64, previous + diff);
      writeInteger(
        output.view,
        pointOffset + field.offset,
        field.type,
        previous,
      );
    },
    reset() {
      previous = 0n;
    },
  };
}

function integerNumberFieldDecoder(field: CloudiniField): CloudiniFieldDecoder {
  let previous = 0;
  return {
    maxInputBytes: 10,
    decode(input, output, pointOffset) {
      previous += input.varintNumber();
      const offset = pointOffset + field.offset;
      switch (field.type) {
        case "INT16":
          output.view.setInt16(offset, previous, true);
          return;
        case "INT32":
          output.view.setInt32(offset, previous, true);
          return;
        case "UINT16":
          output.view.setUint16(offset, previous, true);
          return;
        case "UINT32":
          output.view.setUint32(offset, previous, true);
          return;
        default:
          throw new Error(
            `Cloudini field type ${field.type} is not number delta encoded`,
          );
      }
    },
    reset() {
      previous = 0;
    },
  };
}

function writeInteger(
  output: DataView,
  offset: number,
  type: CloudiniFieldType,
  value: bigint,
): void {
  switch (type) {
    case "INT16":
      output.setInt16(offset, Number(BigInt.asIntN(16, value)), true);
      return;
    case "INT32":
      output.setInt32(offset, Number(BigInt.asIntN(32, value)), true);
      return;
    case "INT64":
      output.setBigInt64(offset, BigInt.asIntN(64, value), true);
      return;
    case "UINT16":
      output.setUint16(offset, Number(BigInt.asUintN(16, value)), true);
      return;
    case "UINT32":
      output.setUint32(offset, Number(BigInt.asUintN(32, value)), true);
      return;
    case "UINT64":
      output.setBigUint64(offset, BigInt.asUintN(64, value), true);
      return;
    default:
      throw new Error(`Cloudini field type ${type} is not delta encoded`);
  }
}

function lossyFloatDecoder(
  field: CloudiniField,
  float64: boolean,
): CloudiniFieldDecoder {
  const resolution = field.resolution;
  if (resolution === undefined) {
    throw new Error(`Cloudini field '${field.name}' is missing a resolution`);
  }
  let previous = 0n;
  return {
    maxInputBytes: 10,
    decode(input, output, pointOffset) {
      const offset = pointOffset + field.offset;
      if (input.peek() === 0) {
        input.take(1);
        previous = 0n;
        if (float64) {
          output.view.setFloat64(offset, Number.NaN, true);
        } else {
          output.view.setFloat32(offset, Number.NaN, true);
        }
        return;
      }

      previous = BigInt.asIntN(64, previous + input.varint());
      const value = Number(previous) * resolution;
      if (float64) {
        output.view.setFloat64(offset, value, true);
      } else {
        output.view.setFloat32(offset, value, true);
      }
    },
    reset() {
      previous = 0n;
    },
  };
}

function lossyFloatGroupDecoder(
  fields: readonly CloudiniField[],
): CloudiniFieldDecoder {
  const previous = fields.map(() => 0);
  return {
    maxInputBytes: fields.length * 10,
    decode(input, output, pointOffset) {
      fields.forEach((field, index) => {
        const resolution = field.resolution;
        if (resolution === undefined) {
          throw new Error(
            `Cloudini field '${field.name}' is missing a resolution`,
          );
        }
        if (input.peek() === 0) {
          input.take(1);
          previous[index] = 0;
          output.view.setFloat32(pointOffset + field.offset, Number.NaN, true);
          return;
        }

        const diff = input.varintNumber() | 0;
        previous[index] = (previous[index] + diff) | 0;
        output.view.setFloat32(
          pointOffset + field.offset,
          previous[index] * resolution,
          true,
        );
      });
    },
    reset() {
      previous.fill(0);
    },
  };
}

function xorFloatDecoder(
  field: CloudiniField,
  float64: boolean,
): CloudiniFieldDecoder {
  let previous = 0n;
  const size = float64 ? 8 : 4;
  return {
    maxInputBytes: size,
    decode(input, output, pointOffset) {
      if (float64) {
        const residual = input.uint64();
        previous = residual ^ previous;
        output.view.setBigUint64(pointOffset + field.offset, previous, true);
      } else {
        const residual = BigInt(input.uint32());
        previous = BigInt.asUintN(32, residual ^ previous);
        output.view.setUint32(
          pointOffset + field.offset,
          Number(previous),
          true,
        );
      }
    },
    reset() {
      previous = 0n;
    },
  };
}

class ByteCursor {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  peek(): number {
    this.require(1);
    return this.bytes[this.offset];
  }

  take(size: number): Uint8Array {
    this.require(size);
    const value = this.bytes.subarray(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }

  copyTo(output: CloudiniOutput, outputOffset: number, size: number): void {
    this.require(size);
    if (outputOffset < 0 || outputOffset + size > output.bytes.byteLength) {
      throw new Error("Cloudini decoded output is too small");
    }
    switch (size) {
      case 1:
        output.bytes[outputOffset] = this.bytes[this.offset];
        break;
      case 2:
        output.view.setUint16(
          outputOffset,
          this.view.getUint16(this.offset, true),
          true,
        );
        break;
      case 4:
        output.view.setUint32(
          outputOffset,
          this.view.getUint32(this.offset, true),
          true,
        );
        break;
      case 8:
        output.view.setBigUint64(
          outputOffset,
          this.view.getBigUint64(this.offset, true),
          true,
        );
        break;
      default:
        throw new Error(`Unsupported Cloudini copy field size ${size}`);
    }
    this.offset += size;
  }

  uint32(): number {
    this.require(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  uint64(): bigint {
    this.require(8);
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  varintNumber(): number {
    let encoded = 0;
    let multiplier = 1;
    for (let count = 0; count < 10; count++) {
      if (this.offset >= this.bytes.byteLength) {
        throw new Error("Cloudini stage data is truncated");
      }
      const byte = this.bytes[this.offset++];
      encoded += (byte & 0x7f) * multiplier;
      if (!Number.isSafeInteger(encoded)) {
        throw new Error("Cloudini varint exceeds safe number precision");
      }
      if ((byte & 0x80) === 0) {
        if (encoded === 0) {
          throw new Error("Unexpected Cloudini NaN marker");
        }
        const zigzag = encoded - 1;
        return zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2;
      }
      multiplier *= 128;
    }
    throw new Error("Cloudini varint overflows 64 bits");
  }

  varint(): bigint {
    let encoded = 0n;
    let shift = 0n;
    for (let count = 0; count < 10; count++) {
      if (this.offset >= this.bytes.byteLength) {
        throw new Error("Cloudini stage data is truncated");
      }
      const byte = this.bytes[this.offset++];
      const payload = BigInt(byte & 0x7f);
      if (shift === 63n && payload > 1n) {
        throw new Error("Cloudini varint overflows 64 bits");
      }
      encoded |= payload << shift;
      if ((byte & 0x80) === 0) {
        if (encoded === 0n) {
          throw new Error("Unexpected Cloudini NaN marker");
        }
        const zigzag = encoded - 1n;
        return (zigzag >> 1n) ^ -(zigzag & 1n);
      }
      shift += 7n;
    }
    throw new Error("Cloudini varint overflows 64 bits");
  }

  private require(size: number): void {
    if (size < 0 || this.offset + size > this.bytes.byteLength) {
      throw new Error("Cloudini stage data is truncated");
    }
  }
}
