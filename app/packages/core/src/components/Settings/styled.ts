import styled from "styled-components";

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const Panel = styled.div`
  width: 860px;
  max-width: 95vw;
  height: 580px;
  max-height: 90vh;
  background: ${({ theme }) => theme.background.level1};
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  border-radius: var(--radius-md);
  display: flex;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
`;

export const LeftNav = styled.nav`
  width: 200px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.background.sidebar};
  border-right: 1px solid ${({ theme }) => theme.primary.plainBorder};
  display: flex;
  flex-direction: column;
  padding: 1.25rem 0;
`;

export const NavTitle = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.text.tertiary};
  padding: 0 1rem 0.75rem;
`;

export const NavItem = styled.button<{ $active: boolean }>`
  all: unset;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: ${({ $active }) => ($active ? "600" : "400")};
  color: ${({ $active, theme }) =>
    $active ? theme.text.primary : theme.text.secondary};
  background: ${({ $active, theme }) =>
    $active ? theme.background.level1 : "transparent"};
  border-radius: var(--radius-sm);
  margin: 0 0.5rem;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.background.level1};
    color: ${({ theme }) => theme.text.primary};
  }
`;

export const ContentArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const ContentHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.primary.plainBorder};
  flex-shrink: 0;
`;

export const ContentTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: ${({ theme }) => theme.text.primary};
`;

export const ContentScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.primary.softBorder};
    border-radius: 3px;
  }
`;

export const CloseButton = styled.button`
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-full);
  color: ${({ theme }) => theme.text.secondary};
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.background.level2};
    color: ${({ theme }) => theme.text.primary};
  }
`;

/* ── Hotkeys ───────────────────────────────────────────────── */

export const ShortcutGroup = styled.div`
  margin-bottom: 1.75rem;
`;

export const GroupLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.text.tertiary};
  margin-bottom: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid ${({ theme }) => theme.primary.plainBorder};
`;

export const ShortcutRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0;

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.primary.softBorder};
  }
`;

export const ShortcutDescription = styled.span`
  font-size: 0.85rem;
  color: ${({ theme }) => theme.text.secondary};
`;

export const KeysRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

export const Key = styled.kbd`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.5rem;
  padding: 0 0.4rem;
  border-radius: var(--radius-xs);
  border: 1px solid ${({ theme }) => theme.primary.softBorder};
  background: ${({ theme }) => theme.background.level2};
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${({ theme }) => theme.text.primary};
  box-shadow: 0 1px 0 ${({ theme }) => theme.primary.softBorder};
  white-space: nowrap;
`;

export const KeySeparator = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.text.tertiary};
`;

/* ── Stub sections ─────────────────────────────────────────── */

export const StubContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.75rem;
  color: ${({ theme }) => theme.text.tertiary};
`;

export const StubLabel = styled.p`
  margin: 0;
  font-size: 0.875rem;
`;
