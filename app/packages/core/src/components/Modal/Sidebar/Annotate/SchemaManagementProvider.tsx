import { useRegisterSchemaManagement } from "./useSchemaResolver";
import { useSchemaManager } from "./useSchemaManager";

/**
 * Component that registers schema management operations for the annotation context.
 *
 * This component must only be rendered when`canManageSchema` is true. It resolves the full
 * {@link SchemaManager} operators and makes management operations available
 * to {@link useAnnotationContextManager} via a shared Jotai atom.
 */
const SchemaManagementProvider = () => {
  const schemaManager = useSchemaManager();
  useRegisterSchemaManagement(schemaManager);
  return null;
};

export default SchemaManagementProvider;
