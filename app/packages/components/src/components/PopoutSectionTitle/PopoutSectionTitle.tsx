import styled from "styled-components";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default styled.div`
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.primary.plainBorder};
  font-size: 1rem;
  line-height: 2;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;
