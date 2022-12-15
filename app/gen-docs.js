const _ = require("lodash");
const fs = require("fs");
const path = require("path");

const docs = require("./docs.json");

////////
/// RST
////////
class RstString {
  constructor(value) {
    this.value = value;
  }
  toSource() {
    let src = [];
    if (this.value !== undefined && this.value !== null)
      src = this.value.split("\n");
    src.push("");
    return src;
  }
}

const SECTION_CHARS = ["=", "-", "~", "^", '"', "'", "*", "+", "#", "."];

class RstSection {
  constructor(label, depth = 1) {
    this.label = label;
    this.depth = depth;
  }
  toSource() {
    return [
      this.label,
      Array(this.label.length + 1).join(SECTION_CHARS[this.depth - 1]),
      "",
    ];
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
    return [`.. code-block:: ${this.lang}`, "", indent(this.src, 3), ""];
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
      `   :maxdepth: ${this.maxDepth}`,
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
    if (!this.rows.length) {
      return [];
    }

    return [
      this.title ? `.. csv-table:: ${this.title}` : `.. csv-table::`,
      this.header ? `  :header: ${this.header.join(", ")}` : null,
      this.widths ? `  :widths: ${this.widths.join(" ")}` : null,
      this.align ? `  :align: ${this.align}` : null,
      "",
      ...this.rows.map(
        (row) =>
          `  ${row
            .filter((c) => c)
            .map(wrapInQuotes)
            .join(",")}`
      ),
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

const MODULE_ALIASES = {
  "@fiftyone/state": "fos",
};

class RstModule {
  constructor(name, description) {
    this.name = name;
    this.alias = MODULE_ALIASES[name];
    this.description = description;
  }
  toSource() {
    return [
      `.. js:module:: ${this.alias || this.name}`,
      this.description ? `   :description: ${this.description}` : null,
      "",
    ];
  }
}
class RstFunction {
  constructor(name) {
    this.name = name;
    this.params = [];
    this._showHeader = true;
    this.indent = 0;
    this._paramNames = new Set();
  }
  hideHeader() {
    this._showHeader = false;
  }
  summary(summary) {
    this._summary = summary;
  }
  param(name, type, description) {
    if (this._paramNames.has(name)) return;
    this._paramNames.add(name);
    this.params.push([name, type, description]);
  }
  returns(type, description) {
    this._returns = [type, description];
  }
  toSource() {
    const params = this.params.map(
      ([name, type, description]) => `   :param ${name}: ${description || ""}`
    );
    const types = this.params.map(
      ([name, type]) => `   :type ${name}: ${type.label()}\n`
    );
    if (params.length) {
      params.unshift("");
    }
    return [
      this._showHeader ? `.. js:function:: ${this.name}` : null,
      "",
      this._summary ? `   :summary: ${indent(this._summary, 6)}` : null,
      ...params,
      ...types,
      this._returns && this._returns[1]
        ? `   :returns: ${this._returns[1] || ""}`
        : null,
      this._returns && this._returns[0]
        ? `   :rtype: ${this._returns[0] || ""}`
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
  constructor(name) {
    this.name = name;
    this.params = [];
    this._paramNames = new Set();
  }
  param(name, type, description) {
    if (this._paramNames.has(name)) return;
    this._paramNames.add(name);
    this.params.push([name, type, description]);
  }
  toSource() {
    const params = this.params.map(
      ([name, type, description]) =>
        `      js:attribute:: foo.${name}: ${description || ""}`
    );
    const types = this.params.map(
      ([name, type]) => `   :type ${name}: ${type.label()}\n`
    );
    if (params.length) {
      params.unshift("");
    }
    return [
      `.. js:class:: ${this.name}`,
      "",
      this._summary ? `   :summary: ${indent(this._summary, 6)}` : null,
      "",
      ...params,
      ...types,
    ];
  }
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
      src = src.concat(
        child
          .toSource()
          .filter((l) => l !== null)
          .map((l) => (child.indent ? indent(l, child.indent * 3) : l))
          .map(replaceLastNewline)
      );
    }
    return src.join("\n");
  }
  refLabel(id) {
    this.string(`.. _${id}:`);
  }
  append(node) {
    if (!node.toSource) {
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
    // this.string([
    //   `.. raw:: html`,
    //   `  <h${level} id="${label}">${label}</h${level}>`
    // ].join('\n'))
    this.append(new RstSection(label, level));
  }
  code(src, lang = "typescript") {
    this.append(new RstCodeExample(lang, src));
  }
  tableOfContents(maxDepth = 1) {
    const toc = new RstTableOfContents(maxDepth);
    this.append(toc);
    return toc;
  }

  typeLabel(type) {
    const label = type.label();

    if (type.isReference()) {
      return `:js:class:\`${label}\``;
    }
    return `\`\`${label}\`\``;
  }
  descToTable(desc) {
    const table = new RstCsvTable({
      header: Array.from(desc.headers),
      // widths: Array.from(desc.headers).map(() => 1),
      align: "left",
    });
    for (const row of desc.rows) {
      const label = row[0][1];
      const type = row[1][1];
      const desc = row[2][1];
      const typeLabel = this.typeLabel(type);
      table.addRow([label, typeLabel, desc]);
    }
    return table;
  }
  desc(desc) {
    this.append(this.descToTable(desc));
  }
  code(src, lang = "typescript") {
    this.append(new RstCodeExample(lang, src));
  }
  table(options) {
    const table = new RstCsvTable(options);
    this.append(table);
    return table;
  }
  func(name) {
    const func = new RstFunction(name);
    this.append(func);
    return func;
  }
  cls(name) {
    const cls = new RstClass(name);
    this.append(cls);
    return cls;
  }
}

////////////
/// MARKDOWN
////////////

class MdString {
  constructor(value) {
    this.value = value;
  }
  toSource() {
    let src = [];
    if (this.value !== undefined && this.value !== null)
      src = this.value.split("\n");
    src.push("");
    return src;
  }
}
class MdSection {
  constructor(label, depth = 1) {
    this.label = label;
    this.depth = depth;
  }
  toSource() {
    return [`${"#".repeat(this.depth)} ${this.label}`, ""];
  }
}
class MdLink {
  constructor(label, url) {
    this.value = value;
  }
  toSource() {
    return [`[${this.label}](${this.url})`];
  }
}
class MdCodeExample {
  constructor(lang, src) {
    this.lang = lang;
    this.src = src;
  }
  toSource() {
    return ["```" + this.lang, this.src, "```", ""];
  }
}

class MdTableOfContents {
  constructor(maxDepth = 1) {
    this.maxDepth = maxDepth;
    this.items = [];
  }
  addItem(label, path) {
    this.items.push({ label, path });
  }
  toSource() {
    let src = [];
    for (let item of this.items) {
      src.push(`- [${item.label}](${item.path})`);
    }
  }
}

class MdListTable {
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
    if (!this.rows.length) {
      return [];
    }

    return [
      this.title ? `# ${this.title}` : null,
      ...this.rows.map((row) => `- ${row.join(" | ")}`),
      "",
    ];
  }
}
class MdCsvTable {
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
    if (!this.rows.length) {
      return [];
    }

    // return an html table

    return [
      this.title ? `# ${this.title}` : null,
      this.header ? `| ${this.header.join(" | ")} |` : null,
      this.widths ? `| ${this.widths.map((w) => `---`).join(" | ")} |` : null,
      ...this.rows.map((row) => `| ${row.map(escapeMdTable).join(" | ")} |`),
      "",
    ];
  }
}

class MdProject {
  constructor() {
    this.files = [];
  }
  file(name) {
    const file = new MdFile(name);
    this.files.push(file);
    return file;
  }
}

class MdModule {
  constructor(name, description) {
    this.name = name;
    this.alias = MODULE_ALIASES[name];
    this.description = description;
  }
  toSource() {
    return [
      `.. js:module:: ${this.alias || this.name}`,
      this.description ? `  :description: ${this.description}` : null,
      "",
    ];
  }
}
class MdFunction {
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
    this._returns = [type, description];
  }
  toSource() {
    const params = this.params.map(
      ([name, type, description]) => `   :param ${name}: ${description || ""}`
    );
    const types = this.params.map(
      ([name, type]) => `   :type ${name}: ${type.label()}`
    );
    if (params.length) {
      params.unshift("");
    }
    return [
      "```{eval-rst}",
      `.. js:function:: ${this.name}`,
      this._summary ? "" : null,
      this._summary ? `   :summary: ${this._summary}` : null,
      ...params,
      ...types,
      this._returns
        ? `   :returns: ${this._returns[0]} ${this._returns[1] || ""}`
        : null,
      "```",
    ];
  }
}
class MdMethod {
  constructor() {}
  toSource() {}
}
class MdClass {
  constructor() {}
  toSource() {}
}
class MdData {
  constructor(name, hidden = false) {
    this.name = name;
    this.hidden = hidden;
  }
  toSource() {
    return [
      `.. js:data:: ${this.name}`,
      this.hidden ? "   :hidden:" : null,
      "",
    ];
  }
}
class MdAttribute {
  constructor() {}
  toSource() {}
}

class MdFile {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  toSource() {
    let src = [];
    for (const child of this.children) {
      src = src.concat(
        child
          .toSource()
          .filter((l) => l !== null)
          .map(replaceLastNewline)
      );
    }
    return src.join("\n");
  }
  append(node) {
    if (!node.toSource) {
      console.error(node);
      throw new Error("node must have a toSource method");
    }
    this.children.push(node);
  }
  typeLabel(type) {
    const label = type.label();

    return `[${label}](${type.fullPath()})`;
  }
  descToTable(desc) {
    const table = new MdCsvTable({
      header: Array.from(desc.headers),
      widths: Array.from(desc.headers).map(() => 1),
      align: "left",
    });
    for (const row of desc.rows) {
      const label = row[0][1];
      const type = row[1][1];
      const desc = row[2][1];
      const typeLabel = this.typeLabel(type);
      table.addRow([label, typeLabel, desc]);
    }
    return table;
  }
  desc(desc) {
    this.append(this.descToTable(desc));
  }
  code(src, lang = "typescript") {
    this.append(new MdCodeExample(lang, src));
  }
  refLabel(name) {}
  string(str) {
    this.append(new MdString(str));
  }
  link(label, url) {
    this.append(new MdLink(label, url));
  }
  section(label, level) {
    this.append(new MdSection(label, level));
  }
  code(src, lang = "typescript") {
    this.append(new MdCodeExample(lang, src));
  }
  table(options) {
    const table = new MdCsvTable(options);
    this.append(table);
    return table;
  }
  func(name) {
    const func = new MdFunction(name);
    this.append(func);
    return func;
  }
  tableOfContents(maxDepth = 1) {
    const toc = new MdTableOfContents(maxDepth);
    this.append(toc);
    return toc;
  }
}

class DocFragment {
  constructor(raw, parent) {
    this.raw = raw;
    this.parent = parent;
  }
  group() {
    console.error(this.constructor);
    throw new Error("must define a group() method");
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
    const name = this.get("name", "");
    if (name.startsWith("_") && name !== "__type") {
      return false;
    }
    return true;
  }
  children() {
    return this.mapArray("children");
  }
  pathParts() {
    let parts = [];
    if (this.parent) {
      parts = this.parent.pathParts();
    } else {
      parts = ["fos"];
    }
    parts.push(this.get("name"));
    return parts;
  }
  fullPath() {
    return this.pathParts().join(".");
  }
  write(file) {
    if (this.hasChildren()) {
      for (const child of this.children()) {
        child.write(file);
      }
    }
  }
}

const GROUPS = ["State", "Hooks", "Functions", "Types", "Enums", "Variables"];

class DocProject extends DocFragment {
  static kind = () => "Project";
  constructor(raw) {
    super(raw);
  }
  write(file) {
    file.section(this.label(), 1);
    file.append(new RstModule(this.label(), this.shortText()));
    const groups = _.groupBy(this.children(), (child) => child.group());
    for (const kind of GROUPS) {
      const children = groups[kind] || [];
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
  group() {
    return "Types";
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
  group() {
    const firstSig = this.signatures().length > 0 ? this.signatures()[0] : null;
    if (firstSig.isReactHook()) {
      return "Hooks";
    }
    return "Functions";
  }
  signatures() {
    return this.get("signatures", []).map((raw) => new DocSignature(raw));
  }
  write(file) {
    file.refLabel(this.fullPath());
    file.section(this.label(), 3, true);
    for (const signature of this.signatures()) {
      this.writeSignature(file, signature);
    }
  }
  writeSignature(file, signature, nested = false, nameOverride) {
    const funcName = nameOverride ? nameOverride : signature.toTextSignature();
    const func = file.func(funcName);
    if (nested) {
      func.indent = 1;
    }
    func.summary(signature.shortText());
    const desc = new FragmentDescription();
    for (const parameter of signature.parameters()) {
      parameter.addToDescription(desc);
    }
    desc.writeTo(func);
    const returnType = signature.returnType();
    const retType = signature.returnType();
    if (retType.isFunction()) {
      const returnTypeFunctionSignature = retType.declaration().signatures()[0];
      const returnFnName = signature.isReactHook()
        ? lowerCaseFirstLetter(this.get("name").replace("use", ""))
        : funcName;
      func.returns(
        returnTypeFunctionSignature.toTextSignature(returnFnName),
        returnType.shortText()
      );
      this.writeSignature(
        file,
        returnTypeFunctionSignature,
        true,
        returnFnName
      );
    } else {
      func.returns(returnType.label(), returnType.shortText());
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
  group() {
    return "Enums";
  }
  write(file) {
    file.refLabel(this.fullPath());
    file.section(this.label(), 3);
    file.string(this.shortText());
    const table = file.table({
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
  group() {
    if (this.type().isRecoil()) {
      return "State";
    }
    return "Variables";
  }
  type() {
    return new DocType(this.get("type"));
  }
  write(file) {
    const type = this.type();
    file.refLabel(this.fullPath());
    file.section(this.label(), 3);
    // file.append(new RstData(this.label()));
    file.typeLabel(type);
    file.string(this.shortText());

    if (type.isRecoil()) {
      const ex = type.isReadOnly()
        ? `const ${this.get("name")} = useRecoilValue(fos.${this.label()});`
        : `const [${this.get("name")}, set${capitalize(
            this.get("name")
          )}] = useRecoilState(fos.${this.label()});`;
      const desc = new FragmentDescription();
      for (const T of type.typeArguments()) {
        T.addToDescription(desc, this.label());
      }
      file.desc(desc);
      file.code(ex);
    } else {
      file.desc(type.toDescription());
    }
  }
}

const typeRegistry = new Map();

class DocType extends DocFragment {
  static kind = () => "Type";
  constructor(raw) {
    super(raw);
    // if (this.get('type') === 'indexedAccess') {
    //   this.raw = this._resolveRaw();
    // }
    // console.log(this.raw)
    typeRegistry.set(raw.id, this);
  }
  // _resolveRaw() {
  //   const targetType = new DocType(this.get('objectType'));
  //   const targetProperty = this.get('indexType.value');
  //   const resolved = targetType.children().find((child) => child.get('name') === targetProperty);
  //   if (resolved) {
  //     return resolved.get(`declaration.children[?(@.name === "${targetProperty}")][0]`)
  //   }
  //   console.error('Failed to resolve', {targetType, targetProperty}, this.raw)
  //   throw new Error(`Could not resolve type`);
  // }
  label() {
    let label = this.get("name", "Any");
    if (this.has("declaration")) {
      label = this.declaration().label();
    }
    const name = this.get("name");
    if (this.isReference() && !this.isGeneric()) {
      label = name;
    }
    if (this.isTuple()) {
      return (
        "[" +
        this.elements()
          .map((t) => t.label())
          .join(", ") +
        "]"
      );
    }
    if (this.isUnion()) {
      return `Union<${this.types()
        .map((t) => t.label())
        .join(" | ")}>`;
    }
    if (this.isArray()) {
      label = "Array";
      if (this.isTypedArray()) {
        label = `${this.elementType().label()}[]`;
      }
    }
    if (this.isFunction()) {
      return this.declaration().signatures()[0].toTextSignatureWithReturnType();
    }
    if (this.isGeneric()) {
      label = `${name}<${this.typeArguments()
        .map((t) => t.label())
        .join(", ")}>`;
    }
    if (this.isLiteral()) {
      // label = this.get("name", );
      label = JSON.stringify(this.get("value")).replace(/"/g, "'");
    }

    if (label !== "null" && label !== "void" && label !== "undefined")
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
  isTuple() {
    return this.get("type") === "tuple";
  }
  typeArguments() {
    return this.get("typeArguments", []).map((raw) => new DocType(raw));
  }
  isReflection() {
    return this.get("type") === "reflection";
  }
  isFunction() {
    return (
      (this.get("type") === "reflection" &&
        this.get("declaration.kindString") === "Function") ||
      this.declaration().isFunction()
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
  elements() {
    return this.mapArray("elements", DocType);
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
    } else if (this.isReference()) {
      const label = this.label();
      const name = parentName ? parentName : label;
      desc.addTypeRow(name, this, this.shortText());
    } else if (
      this.isUnion() ||
      this.isTuple() ||
      this.isLiteral() ||
      this.isIntrinsic()
    ) {
      desc.addTypeRow(parentName, this, this.shortText());
    }
  }
  toDescription() {
    const desc = new FragmentDescription();
    this.addToDescription(desc);
    return desc;
  }
}

class FragmentDescription {
  constructor() {
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
  addTypeRow(name, type, desc) {
    this.add([
      ["Name", name],
      ["Type", type],
      ["Description", desc],
    ]);
  }
  writeTo(writer) {
    for (const row of this.rows) {
      writer.param(...row.map((cell) => cell[1]));
    }
  }
}

class DocTypeAlias extends DocFragment {
  static kind = () => "Type alias";
  constructor(raw) {
    super(raw);
  }
  group() {
    return "Types";
  }
  type() {
    return new DocType(this.get("type"));
  }
  typeParameters() {
    return this.mapArray("typeParameters", DocType);
  }
  write(file) {
    const type = this.type();
    file.refLabel(this.fullPath());
    file.cls(this.label());
    file.section(this.label(), 3);
    file.string(this.shortText());

    if (type.isUnion()) {
      file.string(
        `Union of ${type
          .types()
          .map((t) => `:js:class:\`${t.label()}\``)
          .join(", ")}`
      );
      return;
    }
    const desc = new FragmentDescription();
    type.addToDescription(desc, this.label());
    file.desc(desc);
  }
}

class DocTypeLiteral extends DocFragment {
  static kind = () => "Type literal";
  constructor(raw) {
    super(raw);
  }
  group() {
    return "Types";
  }
  label() {
    if (this.signatures().length > 0) {
      return this.signatures()[0].label();
    }
    if (this.isObject()) {
      return "Object";
    }
    return "Any";
  }
  isFunction() {
    return (
      this.get("kindString") === "Function" || this.signatures().length > 0
    );
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
    desc.addTypeRow(name, type, this.shortText());
  }
}

class DocInterface extends DocFragment {
  static kind = () => "Interface";
  constructor(raw) {
    super(raw);
    typeRegistry.set(raw.id, this);
  }
  group() {
    return "Types";
  }
  extendedTypes() {
    return this.mapArray("extendedTypes", DocType);
  }
  properties() {
    return this.mapArray("children");
  }
  write(file) {
    file.refLabel(this.fullPath());
    file.section(this.label(), 3);
    const cls = file.cls(this.label());
    // file.string(`.. js:class:: ${this.label()}`);
    // file.string(this.shortText());
    const desc = new FragmentDescription();

    if (this.get("indexSignature", null) !== null) {
      const keyName = this.get("indexSignature.parameters.0.name", "key");
      const valueType = new DocType(
        this.get("indexSignature.parameters.0.type")
      );
      desc.addTypeRow(`[${keyName}]`, valueType, valueType.shortText());
    }
    if (this.properties().length > 0) {
      file.section("Properties", 4);
    }
    for (const property of this.properties()) {
      property.addToDescription(desc);
    }
    desc.indent = 1;
    file.desc(desc);
  }
}

class DocSignature extends DocFragment {
  static kind = () => "Call signature";
  constructor(raw) {
    super(raw);
  }
  label() {
    return this.toTextSignature();
  }
  isReactHook() {
    return this.get("name", "").startsWith("use");
  }
  toTextSignature(nameOverride) {
    const name = nameOverride ? nameOverride : this.get("name", "");
    const prefix = name === "__type" ? "" : name;
    return `${prefix}(${this.parameters()
      .map((p) => p.label())
      .join(", ")})`;
  }
  toTextSignatureWithReturnType() {
    return `${this.toTextSignature()} => ${this.returnType().label()}`;
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
    desc.addTypeRow(label, type, this.description());
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

function toFragment(raw, override, parent = null) {
  if (override) {
    return new override(raw);
  }
  for (const type of fragmentTypes) {
    if (type.kind() === raw.kindString) {
      return new type(raw, parent);
    }
  }
  throw new Error(`Unknown fragment type: ${raw.kindString}`);
}

const PLUGIN_RST_DOCS = path.join(__dirname, "..", "docs/source/plugins/api");

const file = new RstFile("state");
// const file = new MdFile("state");
const project = new DocProject(docs);
project.write(file);
fs.writeFileSync(
  path.join(PLUGIN_RST_DOCS, "fiftyone.state.rst"),
  file.toSource()
);

// a function that replaces the last newline character if it is at the end of the string
function replaceLastNewline(str) {
  str = str.trimEnd();
  if (str.endsWith("\n")) {
    return str.slice(0, -1);
  }
  return str;
}

function pluralize(str) {
  if (str.endsWith("s")) {
    return str;
  }
  return str + "s";
}

function wrapInQuotes(str) {
  let newStr = escapeQuotes(str.trim());
  if (!str.startsWith('"')) {
    newStr = '"' + newStr;
  }
  if (!str.endsWith('"')) {
    newStr = newStr + '"';
  }
  return newStr;
}

function escapeQuotes(str) {
  if (str.includes('"')) {
    console.log(str, str.replace(/"/g, '\\"'));
  }
  return str.replace(/"/g, '\\"');
}

function escapeMdTable(str) {
  if (!str) return str;
  return str.replace(/\|/g, "\\|");
}

function code(str) {
  return "``" + str + "``";
}
function uncode(str) {
  return str.replace(/``/g, "");
}
function unref(str) {
  return str.replace(/:ref:`/g, "").replace(/`/g, "");
}

function indent(str, indent = 2) {
  return str.replace(/^/gm, " ".repeat(indent));
}

function lowerCaseFirstLetter(str) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
