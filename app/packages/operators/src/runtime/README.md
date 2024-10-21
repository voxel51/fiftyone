## Operators Runtime

The `runtime` module is the core of the operator framework, responsible for
handling execution, state management, and context resolution. It provides
utilities, hooks, and classes to manage operator interactions within the
FiftyOne App.

### Operator Execution

The operator execution flow is at the core of this submodule. It allows for
defining and triggering operators, both local and remote, while managing their
inputs, outputs, and context.

1. **Operator Definition**:

    - Operators are defined using the `Operator` class, which includes
      configuration, hooks, input/output resolution, and execution logic.
    - Operators can be registered in either the local or remote registries
      using `OperatorRegistry`.

2. **Execution Flow**

-   Operators are executed via the `executeOperator` function, which manages
    the execution of operator logic based on the provided execution context.
    -   **Local Operators**: If the operator is local, the function calls the
        operator’s `execute()` method directly within the current context.
    -   **Remote Operators**: For remote operators, the function sends a
        request to the backend via an API call to trigger execution on the
        server side.
-   The **Invocation Request Queue** manages the sequencing of operator
    execution:
    -   **Queuing Requests**: The `InvocationRequestQueue` adds each operator
        execution request as a `QueueItem`, setting it to the `Pending` state
        initially.
    -   **Managing Execution**: As requests transition to `Executing`, the
        queue tracks their progress, marking them as `Completed` or `Failed`
        based on the execution outcome.
    -   **Subscription System**: Components can subscribe to the queue for
        real-time updates, ensuring dynamic UI responses to operator execution.
-   The execution result is managed using the `OperatorResult` class, which
    tracks:
    -   **Execution Outcomes**: Successful or failed execution results.
    -   **Errors**: Any errors that occur during execution.
    -   **Delegated Operations**: Operations that were handed off to another
        service or function for further processing.

3. **Execution Context**:
    - The `ExecutionContext` class encapsulates all context-related details,
      including dataset, view, selected samples, and filters. It provides a
      consistent context for operators to operate within.
    - The context is passed throughout the operator execution lifecycle,
      ensuring the correct data and state are available at each step.

## Contents

The submodule is organized into the following key directories and files:

-   **`hooks/`**: Contains various hooks that handle operator interactions and
    state management. This includes hooks for operator prompt handling,
    execution contexts, and state updates.
-   **`operators/`**: Contains operator-related utilities, classes, and
    functions that manage operator execution, configuration, and results.
-   **`recoil/`**: Defines Recoil atoms and selectors that maintain the global
    state related to operators and execution contexts.

### Hooks

#### 1. `useOperatorPrompt`

This hook manages the lifecycle of operator prompts, including input
resolution, execution, validation, and state updates. It interacts with Recoil
to manage the operator prompt state and dynamically resolves input fields,
handles execution, and tracks operator outcomes.

#### 2. `useExecutionContext`

This hook generates and maintains an execution context for a given operator. It
relies on Recoil selectors to fetch the current state, integrates with other
hooks for input resolution, and ensures the correct context is available for
operator execution.

#### 3. `useOperatorExecutor`

This hook handles the execution of an operator, including managing its state,
tracking execution status, and handling results or errors. It interacts with
the `Executor` class and ensures that operators can be executed seamlessly from
the UI.

### `executeOperator` Function

The `executeOperator` function is responsible for orchestrating operator
execution. It:

1. Resolves the operator URI and identifies whether it is local or remote.
2. Manages input validation and execution.
3. Handles delegation to backend services for remote operators.
4. Tracks execution results, errors, and updates the execution context
   accordingly.

This function is central to how operators are executed, whether they are
built-in, remote, or dynamically added via plugins.

### `InvocationRequestQueue`

The **Invocation Request Queue** manages the sequencing and execution of
operator invocation requests in the FiftyOne App (browser):

-   **Structure**:
    -   Each request is represented by a `QueueItem`, which contains the
        operator invocation details, execution status, and callbacks.
    -   The queue maintains items in different states: `Pending`, `Executing`,
        `Completed`, or `Failed`.
-   **Functionality**:

    -   **Adding Requests**: Requests are added to the queue through the
        `add()` method, which initializes a `QueueItem` and notifies
        subscribers.
    -   **Execution Control**: Requests are moved from `Pending` to
        `Executing`, and finally to `Completed` or `Failed`, based on the
        outcome.
    -   **Subscriber System**: Supports a subscription mechanism to notify
        components of state changes, enabling real-time updates.

-   **Key Methods**:
    -   `add(request)`: Adds a new invocation request to the queue.
    -   `markAsExecuting(id)`: Marks a request as being executed.
    -   `markAsCompleted(id)`: Marks a request as successfully completed.
    -   `markAsFailed(id)`: Marks a request as failed.
    -   `clean()`: Clears completed requests from the queue.

## Tests

This directory uses [Vitest](https://vitest.dev/) along with React's
[Testing Library](https://testing-library.com/docs/react-testing-library/intro)
to ensure the hooks and operators function correctly. The tests are structured
to run within a Recoil context to simulate the application state and ensure
accurate behavior during execution.

**Running tests**

```
cd $FIFTYONE_DIR/app/packages/operators

# run all tests
yarn test

# run the runtime tests
yarn test -- src/runtime/**

# run a specific test
yarn test -- src/runtime/hooks/useExectuionContext.test.tsx
```
