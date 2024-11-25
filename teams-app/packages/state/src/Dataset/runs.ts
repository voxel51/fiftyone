import { graphql } from "react-relay";
import { atom } from "recoil";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "../constants";

export const runsPageQueryDefaultVariables = {
  filter: {},
  order: { direction: "DESC", field: "updatedAt" },
  page: DEFAULT_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
  search: null,
};

export const runsPageQueryDynamicVariables = atom({
  key: "runsPageQueryDynamicVariables",
  default: runsPageQueryDefaultVariables,
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
        operator
        label
        id
        runState
        startedAt
        queuedAt
        completedAt
        failedAt
        runBy {
          name
          id
        }
        pinned
        runLink
        scheduledAt
        status
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
        id
        status
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
