import { type PageQuery, dataset, type datasetQuery } from "@fiftyone/relay";
import { type State, getCurrentEnvironment } from "@fiftyone/state";
import {
  getTeamsClientEnvironment,
  historyLoadDatasetSnapshotMutation,
  type historyLoadDatasetSnapshotMutationT,
  historySnapshotQuery,
  type historySnapshotQueryT,
} from "@fiftyone/teams-state";
import { loadQuery } from "react-relay";
import {
  type Environment,
  type GraphQLTaggedNode,
  type MutationParameters,
  type OperationType,
  type VariablesOf,
  commitMutation,
  fetchQuery,
  getRequest,
} from "relay-runtime";
import type { HistoryState } from "./state";

export type Page = PageQuery<datasetQuery> & {
  snapshotData: historySnapshotQueryT["response"] | null;
};

const resolveFieldVisibility = (
  fieldVisbility?: State.FieldVisibilityStage
): State.Stage => {
  return {
    _cls: fieldVisbility?.cls || "fiftyone.core.stages.ExcludeFields",
    kwargs: [
      ["field_names", fieldVisbility?.kwargs?.field_names || []],
      ["_allow_missing", true],
    ],
  };
};

const loadPageQuery = async (
  state: HistoryState,
  fieldVisibilityStage?: State.FieldVisibilityStage,
  hard = false
): Promise<Page> => {
  const view: State.Stage[] =
    typeof state.view === "string" ? [] : state.view || [];
  const variables = {
    extendedView: fieldVisibilityStage
      ? view.concat([resolveFieldVisibility(fieldVisibilityStage)])
      : view,
    name: state.datasetName,
    savedViewSlug: typeof state.view === "string" ? state.view : undefined,
    view: view,
    workspaceSlug: state.workspaceSlug,
  };

  let snapshotData: historySnapshotQueryT["response"] | null = null;

  if (state.snapshot) {
    snapshotData = await getQuery<historySnapshotQueryT>(
      getTeamsClientEnvironment(),
      historySnapshotQuery,
      { dataset: state.datasetSlug, snapshot: state.snapshot }
    );

    const snapshotIdentifier =
      await sendMutation<historyLoadDatasetSnapshotMutationT>(
        getTeamsClientEnvironment(),
        historyLoadDatasetSnapshotMutation,
        { datasetIdentifier: state.datasetSlug, snapshotName: state.snapshot }
      );

    variables.name = snapshotIdentifier.loadDatasetSnapshot;
  }

  const data = await getQuery<datasetQuery>(
    getCurrentEnvironment(),
    dataset,
    variables,
    hard
  );

  const preloadedQuery = loadQuery<datasetQuery>(
    getCurrentEnvironment(),
    dataset,
    variables
  );

  return {
    event: state.event,
    data,
    preloadedQuery,
    snapshotData,
    concreteRequest: getRequest(dataset),
  };
};

function getQuery<T extends OperationType>(
  environment: Environment,
  operation: GraphQLTaggedNode,
  variables: VariablesOf<T>,
  hard = false
) {
  const observable = fetchQuery<T>(environment, operation, variables, {
    fetchPolicy: hard ? "network-only" : "store-or-network",
  });

  const promise = new Promise<T["response"]>((resolve, reject) => {
    const subscription = observable.subscribe({
      next: (data) => {
        resolve(data);
        subscription?.unsubscribe();
      },
      error: reject,
    });
  });

  return promise;
}

function sendMutation<T extends MutationParameters>(
  environment: Environment,
  mutation: GraphQLTaggedNode,
  variables: VariablesOf<T>
) {
  return new Promise<T["response"]>((resolve, reject) => {
    commitMutation<T>(environment, {
      mutation,
      variables,
      onCompleted: resolve,
      onError: reject,
    });
  });
}

export default loadPageQuery;
