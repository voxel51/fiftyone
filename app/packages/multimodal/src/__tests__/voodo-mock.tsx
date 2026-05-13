// See packages/tiling/src/__tests__/voodo-mock.tsx for the rationale —
// the real voodo build ships its own @headlessui/react that trips
// useContext under vitest.

import React from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const Button: React.FC<any> = ({
  onClick,
  children,
  leadingIcon: _li,
  variant: _v,
  size: _s,
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

export const Drawer: React.FC<any> = ({ open, children }) =>
  open === false ? null : <div data-testid="drawer">{children}</div>;

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

export const MenuIconTextItem: React.FC<any> = ({ text, onClick, ...rest }) => (
  <button type="button" role="menuitem" onClick={onClick} {...rest}>
    {text}
  </button>
);

export const MenuSeparator: React.FC<any> = () => <hr role="separator" />;

export const Spinner: React.FC<any> = (props) => (
  <span role="status" aria-label="Loading" {...props} />
);

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

export const useElementSize = () => ({
  ref: { current: null },
  width: 0,
  height: 0,
});

export const useDragDelta = () => ({ onPointerDown: () => {} });

export const TextVariant = { Xs: "Xs", Sm: "Sm", Md: "Md", Lg: "Lg" } as const;
export const TextColor = {
  Primary: "Primary",
  Secondary: "Secondary",
  Muted: "Muted",
} as const;
export const HeadingLevel = { H1: "H1", H2: "H2", H3: "H3", H4: "H4" } as const;
export const Variant = {
  Borderless: "Borderless",
  Icon: "Icon",
  Primary: "Primary",
} as const;
export const Size = { Xs: "Xs", Sm: "Sm", Md: "Md", Lg: "Lg" } as const;
export const DropdownAnchor = {
  BottomStart: "BottomStart",
  BottomEnd: "BottomEnd",
} as const;
export const IconName = new Proxy(
  {},
  { get: (_t, p) => p as string }
) as Record<string, string>;
