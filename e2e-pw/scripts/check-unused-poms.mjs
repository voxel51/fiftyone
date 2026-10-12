#!/usr/bin/env node
// Fails on POM, fixture and helper code that no spec reaches: top-level
// declarations and class members (methods, accessors, properties) under
// poms/, fixtures/, utils/, constants/ and src/shared/, and every
// `test.extend({...})` fixture. References resolve through the TypeScript
// language service, and a declaration counts as used only when a reference
// reaches it from a spec or other non-helper code, so members used only by
// other dead members are reported too. Writes (such as constructor
// assignments) don't count as use.
//
// usage: node scripts/check-unused-poms.mjs [e2e-pw dir]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(
  process.argv[2] ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

const CHECKED =
  /\/src\/(?:.+\/)?(?:poms|fixtures|utils|constants)\/|\/src\/shared\//;
const NOT_CHECKED = /\/assets\/|\.test(?:-d)?\.ts$/;

const isChecked = (file) => CHECKED.test(file) && !NOT_CHECKED.test(file);
const isExternal = (file) =>
  !file.startsWith(path.join(root, "src") + path.sep);

const config = ts.getParsedCommandLineOfConfigFile(
  path.join(root, "tsconfig.json"),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
);
const files = config.fileNames.filter((f) => /\.tsx?$/.test(f));

const host = {
  getScriptFileNames: () => files,
  getScriptVersion: () => "0",
  getScriptSnapshot: (f) =>
    fs.existsSync(f)
      ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8"))
      : undefined,
  getCurrentDirectory: () => root,
  getCompilationSettings: () => config.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());
const program = service.getProgram();

// declaration node -> { name, nameNode, kind, sf, line, parent class }
const decls = new Map();

const memberKinds = new Set([
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.PropertyDeclaration,
]);

const track = (node, nameNode, kind, sf, parent) => {
  const line = sf.getLineAndCharacterOfPosition(nameNode.getStart(sf)).line + 1;
  decls.set(node, {
    name: nameNode.getText(sf),
    nameNode,
    kind,
    sf,
    line,
    parent,
  });
};

const trackClass = (cls, sf) => {
  for (const member of cls.members) {
    if (memberKinds.has(member.kind) && member.name) {
      track(member, member.name, "member", sf, cls);
    }
    if (ts.isConstructorDeclaration(member)) {
      for (const param of member.parameters) {
        const props = ts
          .getModifiers(param)
          ?.some((m) =>
            [
              ts.SyntaxKind.PublicKeyword,
              ts.SyntaxKind.PrivateKeyword,
              ts.SyntaxKind.ProtectedKeyword,
              ts.SyntaxKind.ReadonlyKeyword,
            ].includes(m.kind),
          );
        if (props && ts.isIdentifier(param.name)) {
          track(param, param.name, "member", sf, cls);
        }
      }
    }
  }
};

const checker = program.getTypeChecker();

// nodes that belong to a tracked declaration: a fixture's entry in the
// fixture types passed to `extend`
const parts = new Map();
const ROOT = Symbol("root");
const roots = new Set();

const fixtureTypeMembers = (typeNode, sf) => {
  if (ts.isTypeLiteralNode(typeNode)) return typeNode.members;
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const alias = sf.statements.find(
      (s) =>
        ts.isTypeAliasDeclaration(s) &&
        s.name.text === typeNode.typeName.text &&
        ts.isTypeLiteralNode(s.type),
    );
    return alias?.type.members ?? [];
  }
  return [];
};

const isAuto = (init) =>
  ts.isArrayLiteralExpression(init) &&
  init.elements[1] &&
  ts.isObjectLiteralExpression(init.elements[1]) &&
  init.elements[1].properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name.getText() === "auto" &&
      p.initializer.kind === ts.SyntaxKind.TrueKeyword,
  );

const trackFixtures = (sf) => {
  ts.forEachChild(sf, function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "extend" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const literal = node.arguments[0];
      const members = (node.typeArguments ?? []).flatMap((t) =>
        fixtureTypeMembers(t, sf),
      );
      for (const prop of literal.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name))
          continue;
        const name = prop.name.text;
        // specs destructure the fixture through its entry in the types
        const typed = members.find((m) => m.name?.getText(sf) === name);
        track(prop, typed?.name ?? prop.name, "fixture", sf);
        if (typed) parts.set(typed, prop);
        // overrides of Playwright's own fixtures and auto fixtures always run
        const builtIn = checker
          .getContextualType(literal)
          ?.getProperty(name)
          ?.declarations?.every((d) => isExternal(d.getSourceFile().fileName));
        if (builtIn || isAuto(prop.initializer)) roots.add(prop);
      }
    }
    ts.forEachChild(node, visit);
  });
};

for (const sf of program.getSourceFiles()) {
  if (!files.includes(sf.fileName)) continue;
  trackFixtures(sf);
  if (!isChecked(sf.fileName)) continue;
  for (const stmt of sf.statements) {
    if (ts.isClassDeclaration(stmt) && stmt.name) {
      track(stmt, stmt.name, "class", sf);
      trackClass(stmt, sf);
    } else if (
      (ts.isFunctionDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt)) &&
      stmt.name
    ) {
      track(stmt, stmt.name, "declaration", sf);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) track(d, d.name, "declaration", sf);
      }
    }
  }
}

const findNode = (sf, pos) => {
  const visit = (node) =>
    pos >= node.getStart(sf) && pos < node.getEnd()
      ? (ts.forEachChild(node, visit) ?? node)
      : undefined;
  return visit(sf);
};

// `this.x = value` in a constructor belongs to member `x`, so a value only
// stored on a dead member is dead too
const assignedMember = (n) => {
  if (
    !ts.isBinaryExpression(n) ||
    n.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    !ts.isPropertyAccessExpression(n.left) ||
    n.left.expression.kind !== ts.SyntaxKind.ThisKeyword
  ) {
    return undefined;
  }
  const cls = ts.findAncestor(n, ts.isClassLike);
  return [...decls].find(
    ([, info]) => info.parent === cls && info.name === n.left.name.text,
  )?.[0];
};

const owner = (node) => {
  for (let n = node; n; n = n.parent) {
    if (decls.has(n)) return n;
    if (parts.has(n)) return parts.get(n);
    const member = assignedMember(n);
    if (member) return member;
  }
  return undefined;
};

// edges: referencing declaration -> referenced declarations; ROOT for
// references from specs or top-level code
const edges = new Map([[ROOT, roots]]);
const addEdge = (from, to) => {
  if (!edges.has(from)) edges.set(from, new Set());
  edges.get(from).add(to);
};

const isAssignmentTarget = (node) => {
  const target =
    ts.isPropertyAccessExpression(node.parent) && node.parent.name === node
      ? node.parent
      : node;
  return (
    ts.isBinaryExpression(target.parent) &&
    target.parent.left === target &&
    target.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
};

const isAlias = (node) =>
  ts.isImportSpecifier(node.parent) ||
  ts.isExportSpecifier(node.parent) ||
  ts.isImportClause(node.parent) ||
  ts.isNamespaceImport(node.parent);

const isWithin = (node, ancestor) =>
  !!ts.findAncestor(node, (n) => n === ancestor);

// a declaration name (a fixture's type entry, an object literal key) defines
// rather than uses; a shorthand `{ name }` reads the local `name`
const isDeclarationName = (node) =>
  (ts.isPropertySignature(node.parent) ||
    ts.isPropertyAssignment(node.parent) ||
    ts.isPropertyDeclaration(node.parent) ||
    ts.isMethodDeclaration(node.parent)) &&
  node.parent.name === node;

// a member implementing a library contract (an `implements` or `extends`
// type declared outside the checked files) is called by that library
const implementsExternal = (member, cls) =>
  (cls.heritageClauses ?? []).some((clause) =>
    clause.types.some((t) =>
      checker
        .getTypeAtLocation(t)
        .getProperty(member.name.getText())
        ?.declarations?.some((d) => isExternal(d.getSourceFile().fileName)),
    ),
  );

for (const [node, info] of decls) {
  if (info.parent) {
    addEdge(node, info.parent);
    if (implementsExternal(node, info.parent)) addEdge(ROOT, node);
  }
  const refs =
    service.findReferences(info.sf.fileName, info.nameNode.getStart(info.sf)) ??
    [];
  for (const group of refs) {
    for (const ref of group.references) {
      const sf = program.getSourceFile(ref.fileName);
      if (!sf) continue;
      const ident = findNode(sf, ref.textSpan.start);
      // references inside comments (JSDoc links) don't resolve to a token
      if (!ident?.parent || ident.getStart(sf) !== ref.textSpan.start) continue;
      if (decls.get(ident.parent)?.nameNode === ident) continue;
      if (
        isDeclarationName(ident) ||
        isAlias(ident) ||
        isAssignmentTarget(ident)
      ) {
        continue;
      }
      // a parameter property read as the plain parameter needs no property
      const viaThis =
        ts.isPropertyAccessExpression(ident.parent) &&
        ident.parent.name === ident;
      if (ts.isParameter(node) && isWithin(ident, node.parent) && !viaThis)
        continue;
      const from = owner(ident) ?? ROOT;
      if (from !== node) addEdge(from, node);
    }
  }
}

const live = new Set();
const queue = [ROOT];
while (queue.length) {
  for (const to of edges.get(queue.pop()) ?? []) {
    if (!live.has(to)) {
      live.add(to);
      queue.push(to);
    }
  }
}

const dead = [...decls]
  .filter(
    ([node, info]) =>
      !live.has(node) && !(info.parent && !live.has(info.parent)),
  )
  .map(([, info]) => {
    const name = info.parent
      ? `${info.parent.name.text}.${info.name}`
      : info.name;
    return `${path.relative(root, info.sf.fileName)}:${info.line}: unused ${info.kind} ${name}`;
  })
  .sort();

if (dead.length) {
  console.error(dead.join("\n"));
  console.error(
    `\n${dead.length} POM/helper declaration(s) no spec reaches; delete them`,
  );
  process.exit(1);
}
console.log(`no unused POM/helper declarations in ${decls.size} checked`);
