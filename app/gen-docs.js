const _ = require("lodash");
const fs = require("fs");
const path = require("path");

const docs = require("./docs.json");

class RstString {
  constructor(value) {
    this.value = value;
  }
  toSource() {
    if (this.value !== undefined && this.value !== null)
      return this.value.split("\n");
    return [];
  }
}
class RstSection {
  constructor(label, depth = 1) {
    this.label = label;
    this.depth = depth;
  }
  toSource() {
    return [this.label, Array(this.label.length + 1).join("="), ""];
  }
}
class RstLink {
  constructor(label, url) {
    this.value = value;
  }
  toSource() {
    return [`\`${this.label}_\``];
  }
  toPostSource() {
    return [`.. _${this.label}: ${this.url}`];
  }
}
class RstCodeExample {
  constructor(lang, src) {
    this.lang = lang;
    this.src = src;
  }
  toSource() {
    return [`.. code-block:: rst`, "  :linenos:", "", `  ${this.src}`, ""];
  }
}

class RstTableOfContents {
  constructor(maxDepth = 1) {
    this.maxDepth = maxDepth;
    this.items = [];
  }
  addItem(label, path) {
    this.items.push({ label, path });
  }
  toSource() {
    return [
      ".. toctree::",
      `  :maxdepth: ${this.maxDepth}`,
      "",
      ...this.items.map(({ label, path }) =>
        path ? `  ${label} <${path}>` : `  ${label}`
      ),
      "",
    ];
  }
}

class RstListTable {
  constructor({ title, widths, align }) {
    this.title = title;
    this.widths = widths && widths.length ? widths : null;
    this.align = align;
    this.rows = [];
  }
  addRow(row) {
    this.rows.push(row);
  }
  toSource() {
    const firstRow = this.rows[0];
    let src = [
      this.title ? `.. list-table:: ${this.title}` : `.. list-table::`,
      this.widths ? `  :widths: ${this.widths.join(" ")}` : null,
      this.widths ? `  :align: ${this.align}` : null,
      "",
    ];
    for (let row of this.rows) {
      src.push(`  * - ${row[0]}`);
      for (let i = 1; i < row.length; i++) {
        src.push(`    - ${row[i]}`);
      }
    }
    src.push("");
    return src;
  }
}
class RstCsvTable {
  constructor({ title, header, widths, align }) {
    this.title = title;
    this.header = header && header.length ? header : null;
    this.widths = widths && widths.length ? widths : null;
    this.align = align;
    this.rows = [];
  }
  addRow(row) {
    this.rows.push(row);
  }
  toSource() {
    return [
      this.title ? `.. csv-table:: ${this.title}` : `.. csv-table::`,
      this.header ? `  :header: ${this.header.join(", ")}` : null,
      this.widths ? `  :widths: ${this.widths.join(" ")}` : null,
      this.align ? `  :align: ${this.align}` : null,
      "",
      ...this.rows.map((row) => `  ${row.join(",")}`),
      "",
    ];
  }
}

class RstProject {
  constructor() {
    this.files = [];
  }
  file(name) {
    const file = new RstFile(name);
    this.files.push(file);
    return file;
  }
}

class RstModule {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }
  toSource() {
    return [
      `.. js:module:: ${this.name}`,
      this.description ? `  :description: ${this.description}` : null,
      "",
    ];
  }
}
class RstFunction {
  constructor(name) {
    this.name = name;
    this.params = [];
  }
  summary(summary) {
    this._summary = summary;
  }
  param(name, type, description) {
    this.params.push([name, type, description]);
  }
  returns(type, description) {
    this.returns = [type, description];
  }
  toSource() {
    const params = this.params.map(
      ([name, type, description]) =>
        `   :param ${type} ${name}: ${description || ""}`
    );
    if (params.length) {
      params.unshift("");
    }
    return [
      `.. js:function:: ${this.name}`,
      this._summary ? `   ${this._summary}` : null,
      ...params,
      this.returns
        ? `   :returns: ${this.returns[0]} ${this.returns[1] || ""}`
        : null,
      "",
    ];
  }
}
class RstMethod {
  constructor() {}
  toSource() {}
}
class RstClass {
  constructor() {}
  toSource() {}
}
class RstData {
  constructor(name) {
    this.name = name;
  }
  toSource() {
    return [`.. js:data:: ${this.name}`, ""];
  }
}
class RstAttribute {
  constructor() {}
  toSource() {}
}

class RstFile {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  toSource() {
    let src = [];
    for (const child of this.children) {
      src = src.concat(child.toSource().filter((l) => l !== null));
    }
    return src.join("\n");
  }
  append(node) {
    if (!node.toSource) {
      console.log(node);
      throw new Error("node must have a toSource method");
    }
    this.children.push(node);
  }
  string(str) {
    this.append(new RstString(str));
  }
  link(label, url) {
    this.append(new RstLink(label, url));
  }
  section(label, level) {
    this.append(new RstSection(label, level));
  }
  code(src, lang = "typescript") {
    return [`.. code-block:: ${lang}`, "", `  ${src}`];
  }
  tableOfContents(maxDepth = 1) {
    const toc = new RstTableOfContents(maxDepth);
    this.append(toc);
    return toc;
  }
}

class DocFragment {
  constructor(raw) {
    this.raw = raw;
  }
  get(path, defaultValue = null) {
    return _.get(this.raw, path, defaultValue);
  }
  has(path) {
    return _.has(this.raw, path);
  }
  mapArray(path, override) {
    return this.get(path, [])
      .map((raw) => toFragment(raw, override))
      .filter((f) => f.shouldInclude());
  }
  label() {
    return this.get("name");
  }
  shortText() {
    return this.get("comment.summary[0].text");
  }
  hasChildren() {
    return this.get("children", []).length > 0;
  }
  shouldInclude() {
    if (this.get("name", "").startsWith("_")) {
      return false;
    }
    return true;
  }
  children() {
    return this.mapArray("children");
  }
  write(file) {
    if (this.hasChildren()) {
      for (const child of this.children()) {
        child.write(file);
      }
    }
  }
}

class DocProject extends DocFragment {
  static kind = () => "Project";
  constructor(raw) {
    super(raw);
  }
  write(file) {
    file.append(new RstModule(this.label(), this.shortText()));
    const groups = _.groupBy(this.children(), (child) =>
      child.constructor.kind()
    );
    for (const [kind, children] of Object.entries(groups)) {
      file.section(kind, 2);
      for (const child of children) {
        child.write(file);
      }
    }
  }
}

class DocNamespace extends DocFragment {
  static kind = () => "Namespace";
  constructor(raw) {
    super(raw);
  }
}

class DocClass extends DocFragment {
  static kind = () => "Class";
  constructor(raw) {
    super(raw);
  }
}

class DocFunction extends DocFragment {
  static kind = () => "Function";
  constructor(raw) {
    super(raw);
  }
  signatures() {
    return this.get("signatures", []).map((raw) => new DocSignature(raw));
  }
  write(file) {
    for (const signature of this.signatures()) {
      const func = new RstFunction(signature.toTextSignature());
      func.summary(signature.shortText());
      const desc = new FragmentDescription();
      for (const parameter of signature.parameters()) {
        parameter.addToDescription(desc);
      }
      desc.addToRstFunction(func);
      const returnType = signature.returnType();
      func.returns(returnType.label(), returnType.shortText());
      file.append(func);
    }
  }
}

class DocEnumeration extends DocFragment {
  static kind = () => "Enumeration";
  constructor(raw) {
    super(raw);
    this.members = this.get("children", []).map(
      (raw) => new DocEnumerationMember(raw)
    );
  }
  write(file) {
    file.section(this.label(), 2);
    file.string(this.shortText());
    const table = new RstCsvTable({
      title: "Members",
      header: ["Name", "Value"],
      widths: [1, 1],
      align: "left",
    });
    for (const member of this.members) {
      table.addRow([member.name(), member.value()]);
    }
  }
}
class DocEnumerationMember extends DocFragment {
  static kind = () => "Enumeration Member";
  constructor(raw) {
    super(raw);
  }
  name() {
    return this.get("name");
  }
  value() {
    return this.get("value");
  }
}
class DocVar extends DocFragment {
  static kind = () => "Variable";
  constructor(raw) {
    super(raw);
  }
  type() {
    return new DocType(this.get("type"));
  }
  write(file) {
    file.append(new RstData(this.label(), this.shortText()));
  }
}

const typeRegistry = new Map();

class DocType extends DocFragment {
  static kind = () => "Type";
  constructor(raw) {
    super(raw);
    typeRegistry.set(raw.id, this);
  }
  label() {
    let label = this.get("name", "Any");
    if (this.has("declaration")) {
      label = this.declaration().label();
    }
    if (this.isLiteral()) {
      label = this.get("name", typeof this.get("value"));
    }
    const name = this.get("name");
    if (this.isReference() && !this.isGeneric()) {
      label = name;
    }
    if (this.isUnion()) {
      label = this.types()
        .map((t) => t.label())
        .join(" | ");
    }
    if (this.isArray()) {
      label = "Array";
      if (this.isTypedArray()) {
        label = `${this.elementType().label()}[]`;
      }
    }
    if (this.isGeneric()) {
      label = `${name}<${this.typeArguments()
        .map((t) => t.label())
        .join(", ")}>`;
    }
    label = capitalize(label);
    if (this.isReadOnly()) {
      label = `readonly ${label}`;
    }
    return label;
  }
  isLiteral() {
    return this.get("type") === "literal";
  }
  isIntrinsic() {
    return this.get("type") === "intrinsic";
  }
  isReference() {
    return this.get("type") === "reference";
  }
  isUnion() {
    return this.get("type") === "union";
  }
  isGeneric() {
    return this.get("typeArguments", []).length > 0;
  }
  typeArguments() {
    return this.get("typeArguments", []).map((raw) => new DocType(raw));
  }
  isReflection() {
    return this.get("type") === "reflection";
  }
  isFunction() {
    return (
      this.get("type") === "reflection" &&
      this.get("declaration.kindString") === "Function"
    );
  }
  isObject() {
    if (this.has("declaration")) {
      return this.declaration().isObject();
    }
    return false;
  }
  isArray() {
    return this.get("type") === "array";
  }
  isTypedArray() {
    return this.isArray() && this.get("elementType", null) !== null;
  }
  elementType() {
    return new DocType(this.get("elementType"));
  }
  declaration() {
    return new DocTypeLiteral(this.get("declaration"));
  }
  signatures() {
    return this.mapArray("signatures");
  }
  types() {
    return this.mapArray("types", DocType);
  }
  isRecoil() {
    return this.get("package") === "recoil";
  }
  isRecoilWritable() {
    return this.get("name") === "RecoilState";
  }
  isRecoilReadOnly() {
    return this.get("name") === "RecoilValueReadOnly";
  }
  isReadOnly() {
    if (this.get("operator") === "readonly") return true;
    if (this.isRecoilReadOnly()) return true;
    if (
      this.isGeneric() &&
      this.typeArguments().length === 1 &&
      this.typeArguments()[0].isReadOnly()
    )
      return true;
    return false;
  }
  addToDescription(desc, parentName = null) {
    if (this.isReflection()) {
      this.declaration().addToDescription(desc, parentName);
    }
  }
}

class FragmentDescription {
  constructor(fragment) {
    this.headers = new Set();
    this.rows = [];
    this.currentRow = [];
  }
  add(row) {
    for (const cell of row) {
      const header = cell[0];
      this.headers.add(header);
    }
    this.rows.push(row);
  }
  toTable() {
    const table = new RstCsvTable({
      header: Array.from(this.headers),
      widths: Array.from(this.headers).map(() => 1),
      align: "left",
    });
    for (const row of this.rows) {
      table.addRow(row.map((cell) => cell[1]));
    }
    return table;
  }
  addToRstFunction(func) {
    for (const row of this.rows) {
      func.param(...row.map((cell) => cell[1]));
    }
  }
}

class DocTypeAlias extends DocFragment {
  static kind = () => "Type alias";
  constructor(raw) {
    super(raw);
  }
}

class DocTypeLiteral extends DocFragment {
  static kind = () => "Type literal";
  constructor(raw) {
    super(raw);
  }
  label() {
    if (this.isFunction()) {
      return "Function";
    }
    if (this.isObject()) {
      return "Object";
    }
    return "Any";
  }
  isFunction() {
    return this.get("kindString") === "Function";
  }
  isObject() {
    return this.get("children", []).length > 0;
  }
  isArray() {
    return this.get("type") === "array";
  }
  isTypedArray() {
    return this.isArray() && this.get("elementType", null) !== null;
  }
  elementType() {
    return new DocType(this.get("elementType"));
  }
  signatures() {
    return this.mapArray("signatures");
  }
  properties() {
    return this.mapArray("children");
  }
  addToDescription(desc, parentName = null) {
    if (this.isObject()) {
      for (const property of this.properties()) {
        property.addToDescription(desc, parentName);
      }
    }
  }
}

class DocProperty extends DocFragment {
  static kind = () => "Property";
  constructor(raw) {
    super(raw);
  }
  type() {
    return new DocType(this.get("type"));
  }
  addToDescription(desc, parentName = null) {
    const label = this.label();
    const name = parentName ? `${parentName}.${label}` : label;
    const type = this.type();
    desc.add([
      ["Name", name],
      ["Type", type.label()],
      ["Description", this.shortText()],
    ]);
  }
}

class DocInterface extends DocFragment {
  static kind = () => "Interface";
  constructor(raw) {
    super(raw);
    typeRegistry.set(raw.id, this);
  }
  extendedTypes() {
    return this.mapArray("extendedTypes", DocType);
  }
}

class DocSignature extends DocFragment {
  static kind = () => "Signature";
  constructor(raw) {
    super(raw);
  }
  toTextSignature() {
    return `${this.label()}(${this.parameters()
      .map((p) => p.label())
      .join(", ")})`;
  }
  parameters() {
    return this.get("parameters", []).map((p) => new DocParameter(p));
  }
  returnType() {
    return new DocType(this.get("type", { type: "intrinsic", name: "void" }));
  }
}

class DocParameter extends DocFragment {
  static kind = () => "Parameter";
  constructor(raw) {
    super(raw);
  }
  type() {
    return new DocType(this.get("type"));
  }
  description() {
    return this.get("comment.text");
  }
  addToDescription(desc) {
    const type = this.type();
    const label = this.label();
    desc.add([
      ["Name", label],
      ["Type", type.label()],
      ["Description", this.description()],
    ]);
    type.addToDescription(desc, label);
  }
}

const fragmentTypes = [
  DocClass,
  DocFunction,
  DocEnumeration,
  DocEnumerationMember,
  DocVar,
  DocType,
  DocTypeLiteral,
  DocProperty,
  DocInterface,
  DocSignature,
  DocParameter,
  DocNamespace,
  DocProject,
  DocTypeAlias,
];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toFragment(raw, override) {
  if (override) {
    return new override(raw);
  }
  for (const type of fragmentTypes) {
    if (type.kind() === raw.kindString) {
      return new type(raw);
    }
  }
  throw new Error(`Unknown fragment type: ${raw.kindString}`);
}

const PLUGIN_RST_DOCS = path.join(__dirname, "..", "docs/source/plugins/api");

const file = new RstFile("state");
const project = new DocProject(docs);
project.write(file);
fs.writeFileSync(
  path.join(PLUGIN_RST_DOCS, "fiftyone.state.rst"),
  file.toSource()
);
