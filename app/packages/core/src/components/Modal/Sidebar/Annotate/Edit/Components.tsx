import styled from "styled-components";

export const Row = styled.div`
  align-items: center;
  color: ${({ theme }) => theme.text.secondary};
  display: flex;
  justify-content: space-between;
  margin: 0.5rem -1rem;
  padding: 0 0.5rem;
`;
