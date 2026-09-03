/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Stage descriptions are docstring sentences, and docstrings are Sphinx
 * source: `:class:`fiftyone.core.labels.Label`` roles and ``None``
 * literals read as markup, not prose. This renders the prose — a role
 * becomes its bare class name linking to the API docs, a literal becomes
 * code.
 */

import React from "react";

import styles from "./description.module.css";

export type DescriptionToken =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "ref"; text: string; href: string };

const DOCS_ROOT = "https://docs.voxel51.com/api/";

/**
 * The docs page for a dotted path — the module's page, anchored to the
 * member. The module is everything before the first capitalized segment,
 * matching how the API docs are laid out; a `:mod:` role is its own page.
 */
const docsUrl = (path: string, role: string): string => {
  if (role === "mod") return `${DOCS_ROOT}${path}.html`;
  const segments = path.split(".");
  const capital = segments.findIndex((segment) => /^[A-Z]/.test(segment));
  const module =
    capital > 0 ? segments.slice(0, capital) : segments.slice(0, -1);
  if (!module.length) return `${DOCS_ROOT}${path}.html`;
  return `${DOCS_ROOT}${module.join(".")}.html#${path}`;
};

// A Sphinx role (`:class:`~x.Y``) or an inline literal (```` ``None`` ````)
const MARKUP = /:([a-z]+):`([^`]+)`|``([^`]+)``/g;

export const tokenize = (text: string): DescriptionToken[] => {
  const tokens: DescriptionToken[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKUP)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ kind: "text", text: text.slice(last, index) });
    }
    if (match[3] !== undefined) {
      tokens.push({ kind: "code", text: match[3] });
    } else {
      // `~` is Sphinx for "render the last segment only" — which is the
      // only rendering here, so it carries no information to keep
      const path = match[2].replace(/^~/, "");
      tokens.push({
        kind: "ref",
        text: path.split(".").pop() ?? path,
        href: docsUrl(path, match[1]),
      });
    }
    last = index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ kind: "text", text: text.slice(last) });
  }
  return tokens;
};

export const StageDescription: React.FC<{ text: string }> = ({ text }) => (
  <>
    {tokenize(text).map((token, i) => {
      if (token.kind === "code") {
        return (
          <code key={i} className={styles.code}>
            {token.text}
          </code>
        );
      }
      if (token.kind === "ref") {
        return (
          <a
            key={i}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            // The link sits inside listbox options that insert on mousedown;
            // following it must not also pick the option
            onMouseDown={(e) => e.stopPropagation()}
            className={styles.ref}
          >
            {token.text}
          </a>
        );
      }
      return <React.Fragment key={i}>{token.text}</React.Fragment>;
    })}
  </>
);
