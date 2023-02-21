import { atomFamily, selectorFamily } from "recoil";
import styled from "styled-components";
import * as fos from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";

export const InputDiv = styled.div`
  box-sizing: border-box;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  padding-top: 2px;

  display: flex;
  justify-content: space-between;
  & > input {
    color: ${({ theme }) => theme.text.secondary};
    font-size: 14px !important;
    font-size: 1rem;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border: none;
    outline: none;
    border-bottom: 2px solid ${({ theme }) => theme.background.level1};
    text-transform: uppercase;
    font-weight: bold;
    padding: 3px;
  }
`;

export const pathIsExpanded = atomFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "pathIsExpanded",
  default: false,
});

const ACTIVE_ATOM = {
  [fos.State.TagKey.LABEL]: fos.activeLabelTags,
  [fos.State.TagKey.SAMPLE]: fos.activeTags,
};

export const tagIsActive = selectorFamily<
  boolean,
  { key: fos.State.TagKey; tag: string; modal: boolean }
>({
  key: "tagIsActive",
  get:
    ({ key, tag, modal }) =>
    ({ get }) =>
      get(ACTIVE_ATOM[key](modal)).includes(tag),
  set:
    ({ key, tag, modal }) =>
    ({ get, set }) => {
      const atom = ACTIVE_ATOM[key](modal);
      const current = get(atom);

      set(
        atom,
        current.includes(tag)
          ? current.filter((t) => t !== tag)
          : [tag, ...current]
      );
    },
});

export const makePseudoField = (path: string): Field => ({
  name: path.split(".").slice(1).join("."),
  ftype: "",
  subfield: null,
  description: "",
  info: null,
  fields: {},
  dbField: null,
  path: path,
  embeddedDocType: null,
});
