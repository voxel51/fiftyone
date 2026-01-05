import styled from "styled-components";

export const Column = styled.div`
  display: flex;
  justify-content: space-between;
`;

const Container = styled.div`
  align-items: center;
  display: flex;
  cursor: pointer;
  flex-direction: column;
  height: 2.5rem;
  justify-content: center;
  padding: 0.25rem;
  width: 2.5rem;

  &:hover {
    background: ${({ theme }) => theme.action.active};
  }

  &:hover path {
    fill: ${({ theme }) => theme.primary.plainColor};
  }
`;

export const Round = styled(Container)`
  border-radius: 1.25rem;

  &:hover {
    color: ${({ theme }) => theme.text.primary};
  }
`;

export const Square = styled(Container)`
  border-radius: 0.25rem;
`;

const ItemColumn = styled.div`
  display: flex;
  align-items: center;
`;

export const ItemLeft = styled(ItemColumn)`
  justify-content: left;
`;

export const ItemRight = styled(ItemColumn)`
  justify-content: right;
`;
