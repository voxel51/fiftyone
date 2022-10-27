import styled from "styled-components";

export default styled.div`
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.background.level1};
  font-size: 1rem;
  line-height: 2;
  font-weight: bold;
`;
