import { graphql } from "react-relay";
import { atom } from "recoil";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "../constants";

export const runsPageQueryDefaultVariables = {
  filter: {},
  order: { direction: "DESC", field: "scheduledAt" },
  page: DEFAULT_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
  search: null,
};

export const runsPageQueryDynamicVariables = atom({
  key: "runsPageQueryDynamicVariables",
  default: runsPageQueryDefaultVariables,
});

export const runsPageFilterDatasetSelectionState = atom<"this" | "all">({
  key: "runsPageFilterDatasetSelectionState",
  default: "this",
});

export const orchestratorDialogAtom = atom({
  key: "orchestratorDialogAtom",
  default: {
    description: "",
    id: "",
    open: false,
    createdAt: "",
    deactivatedAt: "",
    updatedAt: "",
  },
});

export const autoRefreshRunsStatus = atom({
  key: "autoRefreshRunsStatus",
  default: false,
});

export const runsPageQuery = graphql`
  query runsPageQuery(
    $filter: DelegatedOperationFilter = null
    $order: DelegatedOperationOrderFieldsOrder = null
    $page: Int!
    $pageSize: Int!
    $search: DelegatedOperationSearchFieldsSearch = null
  ) {
    delegatedOperationsPage(
      filter: $filter
      order: $order
      page: $page
      pageSize: $pageSize
      search: $search
    ) {
      nodeTotal
      nodes {
        completedAt
        datasetId
        datasetName
        datasetSlug
        failedAt
        id
        label
        logPath
        logUploadError
        logUrl
        operator
        pinned
        priority
        priorityTotal
        queuedAt
        runBy {
          id
          name
        }
        runLink
        runState
        scheduledAt
        startedAt
        status
        updatedAt
      }
      pageTotal
    }
  }
`;

export const runsPageStatusQuery = graphql`
  query runsPageStatusQuery(
    $filter: DelegatedOperationFilter = null
    $order: DelegatedOperationOrderFieldsOrder = null
    $page: Int!
    $pageSize: Int!
    $search: DelegatedOperationSearchFieldsSearch = null
  ) {
    delegatedOperationsPage(
      filter: $filter
      order: $order
      page: $page
      pageSize: $pageSize
      search: $search
    ) {
      nodes {
        completedAt
        failedAt
        id
        queuedAt
        runState
        scheduledAt
        startedAt
        status
        priority
        priorityTotal
      }
    }
  }
`;

export const runsOrchestratorsQuery = graphql`
  query runsOrchestratorsQuery($page: Int!, $pageSize: Int!) {
    orchestratorsPage(page: $page, pageSize: $pageSize) {
      nodeTotal
      nodes {
        createdAt
        deactivatedAt
        orchestratorIdentifier
        description
        updatedAt
      }
    }
  }
`;

export const runsOrchestratorQuery = graphql`
  query runsOrchestratorQuery($orchestratorIdentifier: String!) {
    orchestrator(orchestratorIdentifier: $orchestratorIdentifier) {
      availableOperators
    }
  }
`;

export const runsItemQuery = graphql`
  query runsItemQuery($run: String!) {
    delegatedOperation(operationId: $run) {
      completedAt
      context
      datasetId
      failedAt
      id
      operator
      label
      pinned
      queuedAt
      result
      runBy {
        name
        id
      }
      runState
      scheduledAt
      startedAt
      status
      runLink
      priority
      logPath
      logUrl
      logSize
      logUploadError
      metadata
    }
  }
`;
export const runsLogQuery = graphql`
  query runsLogQuery($run: String!) {
    delegatedOperation(operationId: $run) {
      id
      logConnection(first: 200000, after: null) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          node {
            content
            date
            level
          }
          cursor
        }
      }
      completedAt
      context
      datasetId
      failedAt
      operator
      label
      pinned
      queuedAt
      result
      runBy {
        name
        id
      }
      runState
      scheduledAt
      startedAt
      status
      runLink
      priority
      logPath
      logUrl
      logSize
      logUploadError
      metadata
    }
  }
`;

export const runsPinMutation = graphql`
  mutation runsPinMutation($operationId: String!, $pinned: Boolean!) {
    setDelegatedOperationPinned(operationId: $operationId, pinned: $pinned) {
      id
      pinned
    }
  }
`;

export const runsReRunMutation = graphql`
  mutation runsReRunMutation($operationId: String!) {
    rerunDelegatedOperation(operationId: $operationId) {
      completedAt
      context
      datasetId
      failedAt
      id
      operator
      label
      pinned
      queuedAt
      result
      runBy {
        name
      }
      runState
      scheduledAt
      startedAt
      updatedAt
    }
  }
`;

export const runsRenameRunMutation = graphql`
  mutation runsRenameRunMutation($label: String!, $operationId: String!) {
    setDelegatedOperationLabel(label: $label, operationId: $operationId) {
      id
      label
    }
  }
`;

export const runsMarkRunFailedMutation = graphql`
  mutation runsMarkRunFailedMutation($operationId: String!) {
    setDelegatedOperationFailed(operationId: $operationId) {
      id
      runState
    }
  }
`;

export const runsDeleteRunMutation = graphql`
  mutation runsDeleteRunMutation($operationId: String!) {
    deleteDelegatedOperation(operationId: $operationId)
  }
`;
