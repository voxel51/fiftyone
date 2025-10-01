import styled from "styled-components";

export const Container = styled.div`
  flex: 1;
  margin: 0 -2rem;
  margin-bottom: 34px;
  overflow-y: auto;
  padding: 0 2rem;
  position: relative;
`;

export const Item = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  background: ${({ theme }) => theme.background.body};
  border-radius: 4px;
  height: 48px;
  margin: 1rem 0;
  padding: 0 1rem;
  align-items: center;
`;

export const MutedItem = styled(Item)`
  opacity: 0.9;
  text-align: center;
  color: ${({ theme }) => theme.text.secondary};
  justify-content: center;
`;
