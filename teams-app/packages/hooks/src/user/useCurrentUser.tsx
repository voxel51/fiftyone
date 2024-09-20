import {
  UserQueryT,
  currentUserQuery,
  userAttrFragment
} from '@fiftyone/teams-state';
import { useState } from 'react';
import { useFragment, useLazyLoadQuery } from 'react-relay';


export default function useCurrentUser(
): [UserQuery$dataT['viewer'], () => void] {

  const [fetchKey, setFetchKey] = useState(0);

  const data = useLazyLoadQuery<UserQueryT>(
    currentUserQuery,
    {},
    { fetchPolicy: 'store-and-network', fetchKey }
  );

  function refetch() {
    setFetchKey(fetchKey + 1);
  }

  const attributes = data.viewer.attributes.map((attr) => {
    let data;
    data = useFragment(userAttrFragment, attr);
    switch (data.__typename) {
      case 'BoolUserAttributeInfo':
        return {
          id: data.attribute,
          value: data.boolValue
        };
      case 'DatasetAccessLevelUserAttributeInfo':
        return {
          id: data.attribute,
          value: data.accessLevelValue
        };
      case 'DatasetPermissionUserAttributeInfo':
        return {
          id: data.attribute,
          value: data.permissionValue
        };
      default:
        console.error('unexpected typename:', data.__typename);
        return null; // Handle unexpected types or provide a default behavior
    }
  });
  const converted = convertAttributesToObject(attributes);

  // restructure the attributes into an object
  const newUser = { ...data.viewer, attributes: converted };

  return [newUser, refetch];
}

function convertAttributesToObject(attributesArray) {
  return attributesArray.reduce((acc, attr) => {
    if (attr !== null && attr.id) {
      // Assuming boolean type values for permissions, you may need to adjust this logic based on actual data types and requirements.
      acc[attr.id] = attr.value;
    }
    return acc;
  }, {});
}
