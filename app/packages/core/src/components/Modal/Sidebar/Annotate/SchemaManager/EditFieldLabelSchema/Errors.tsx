import { ErrorContainer } from "../styled";

const ErrorsList = ({ errors }: { errors: string[] }) => {
  return (
    <ul data-cy="errors-list">
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
