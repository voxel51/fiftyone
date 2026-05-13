// Test-only stand-in for `@voxel51/voodo`. The real voodo bundle ships
// its own `@headlessui/react`, which loads through a separate React
// instance and trips `useContext` checks under vitest. Components in
// tests that just need click handlers, aria attributes, and rendered
// text don't need the full design-system implementation — these
// pass-through stubs are enough.
//
// Use via `vi.mock("@voxel51/voodo", () => voodoMock)` at the top of
// each test file that mounts a component reaching into voodo's
// hook-using exports (Button, Dropdown, …).

import React from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Button: React.FC<any> = ({
  onClick,
  children,
  leadingIcon: _leadingIcon,
  variant: _variant,
  size: _size,
  ...rest
}) => (
  <button type="button" onClick={onClick} {...rest}>
    {children}
  </button>
);

export const Text: React.FC<any> = ({ children, ...rest }) => (
  <span {...rest}>{children}</span>
);

export const Heading: React.FC<any> = ({ children, ...rest }) => (
  <h2 {...rest}>{children}</h2>
);

export const Divider: React.FC<any> = () => <hr />;

export const Checkbox: React.FC<any> = ({ label, ...rest }) => (
  <label>
    <input type="checkbox" {...rest} />
    {label}
  </label>
);

export const Select: React.FC<any> = ({ options = [], value, onChange }) => (
  <select
    value={value ?? ""}
    onChange={(e) => onChange?.(e.target.value)}
  >
    {options.map((opt: any) => (
      <option key={opt.id} value={opt.id}>
        {opt.data?.label ?? opt.id}
      </option>
    ))}
  </select>
);

export const Dropdown: React.FC<any> = ({ trigger, children }) => (
  <>
    {trigger}
    <div role="menu">{children}</div>
  </>
);

export const DropdownTrigger: React.FC<any> = ({ children, ...rest }) => (
  <button type="button" {...rest}>
    {children}
  </button>
);

export const MenuIconTextItem: React.FC<any> = ({
  text,
  onClick,
  ...rest
}) => (
  <button type="button" role="menuitem" onClick={onClick} {...rest}>
    {text}
  </button>
);

export const MenuSeparator: React.FC<any> = () => <hr role="separator" />;

export const Drawer: React.FC<any> = ({ header, children }) => (
  <div>
    {typeof header === "function" ? header({ toggle: () => {} }) : header}
    {children}
  </div>
);

export const useElementSize = () => ({
  ref: { current: null },
  width: 0,
  height: 0,
});

export const useDragDelta = () => ({ onPointerDown: () => {} });

export const TextVariant = {
  Xs: "Xs",
  Sm: "Sm",
  Md: "Md",
  Lg: "Lg",
} as const;

export const TextColor = {
  Primary: "Primary",
  Secondary: "Secondary",
  Muted: "Muted",
} as const;

export const HeadingLevel = {
  H1: "H1",
  H2: "H2",
  H3: "H3",
  H4: "H4",
} as const;

export const Variant = {
  Borderless: "Borderless",
  Icon: "Icon",
  Primary: "Primary",
} as const;

export const Size = {
  Xs: "Xs",
  Sm: "Sm",
  Md: "Md",
} as const;

export const DropdownAnchor = {
  BottomStart: "BottomStart",
  BottomEnd: "BottomEnd",
} as const;

export const IconName = new Proxy(
  {},
  { get: (_t, prop) => prop as string }
) as Record<string, string>;
