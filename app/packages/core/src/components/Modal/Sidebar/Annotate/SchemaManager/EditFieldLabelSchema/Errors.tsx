import styled from "styled-components";

const ErrorContainer = styled.div`
  align-items: flex-start;
  align-self: stretch;
  background: #441817;
  box-shadow: 0 1px 2px 0 rgba(16, 24, 40, 0.05);
  border: 1px solid rgba(212, 64, 64, 0.4);
  border-radius: 4px;
  color: var(--voxel-danger, #d44040);
  display: flex;
  flex-direction: column;
  font-weight: bold;
  gap: 12px;
  justify-content: center;
  margin-top: 1rem;
  max-height: 300px;
`;

const ErrorsList = ({ errors }: { errors: string[] }) => {
  return (
    <ul>
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
};

const Errors = ({ errors }: { errors: string[] }) => {
  if (!errors.length) {
    return null;
  }

  return (
    <ErrorContainer>
      <ErrorsList errors={errors} />
    </ErrorContainer>
  );
};

export default Errors;
