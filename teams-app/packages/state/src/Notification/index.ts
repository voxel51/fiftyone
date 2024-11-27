import { graphql } from "react-relay/hooks";

export const notificationFrag = graphql`
  fragment NotificationFrag on Notification {
    kind
    code
    level
    title
    details
    read
  }
`;

export const getNotificationsQuery = graphql`
  query NotificationQuery {
    notifications(filter: { kinds: [GLOBAL], read: false }) {
      ...NotificationFrag
    }
  }
`;
