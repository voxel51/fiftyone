import styled from "styled-components";

const ItemColumn = styled.div`
  display: flex;
  align-items: center;
  column-gap: 1rem;
`;

export const ItemLeft = styled(ItemColumn)`
  justify-content: left;
`;

export const ItemRight = styled(ItemColumn)`
  justify-content: right;
`;
