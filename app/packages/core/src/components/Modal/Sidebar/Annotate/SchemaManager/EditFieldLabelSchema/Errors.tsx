import styled from "styled-components";

const ErrorContainer = styled.div`
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 12px;
  align-self: stretch;
  max-height: 300px;

  border-radius: 4px;

  /* Shadow/xs */
  box-shadow: 0 1px 2px 0 rgba(16, 24, 40, 0.05);

  border-radius: 4px;
  border: 1px solid rgba(212, 64, 64, 0.4);

  background: #441817;
  color: var(--voxel-danger, #d44040);
  font-weight: bold;
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
    return;
  }
  return (
    <ErrorContainer>
      <ErrorsList errors={errors} />
    </ErrorContainer>
  );
};

export default Errors;
