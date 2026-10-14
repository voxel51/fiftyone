/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Stage descriptions are docstring sentences, and docstrings are Sphinx
 * source: `:class:`fiftyone.core.labels.Label`` roles and ``None``
 * literals read as markup, not prose. This renders the prose — a role
 * becomes its bare name, a literal becomes code. Neither is a link: the
 * description sits inside list options, where a link is a trap for the
 * click that meant to pick the option.
 */

import React from "react";

import styles from "./description.module.css";

export type DescriptionToken =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "ref"; text: string };

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
      tokens.push({ kind: "ref", text: path.split(".").pop() ?? path });
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
    {tokenize(text).map((token, i) =>
      token.kind === "text" ? (
        <React.Fragment key={i}>{token.text}</React.Fragment>
      ) : (
        <code key={i} className={styles.code}>
          {token.text}
        </code>
      ),
    )}
  </>
);
