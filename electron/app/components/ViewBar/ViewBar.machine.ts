import { Machine, assign, spawn } from "xstate";
import uuid from "uuid-v4";
import { todoMachine } from "./todoMachine";

const createTodo = (title) => {
  return {
    id: uuid(),
    title: title,
    completed: false,
  };
};

export const todosMachine = Machine({
  id: "todos",
  context: {
    todo: "", // new todo
    todos: [],
  },
  initial: "initializing",
  states: {
    initializing: {
      entry: assign({
        todos: (ctx, e) => {
          return ctx.todos.map((todo) => ({
            ...todo,
            ref: spawn(todoMachine.withContext(todo)),
          }));
        },
      }),
      on: {
        "": "all",
      },
    },
    all: {},
    active: {},
    completed: {},
  },
  on: {
    "NEWTODO.CHANGE": {
      actions: assign({
        todo: (ctx, e) => e.value,
      }),
    },
    "NEWTODO.COMMIT": {
      actions: [
        assign({
          todo: "", // clear todo
          todos: (ctx, e) => {
            const newTodo = createTodo(e.value.trim());
            return ctx.todos.concat({
              ...newTodo,
              ref: spawn(todoMachine.withContext(newTodo)),
            });
          },
        }),
        "persist",
      ],
      cond: (ctx, e) => e.value.trim().length,
    },
    "TODO.COMMIT": {
      actions: [
        assign({
          todos: (ctx, e) =>
            ctx.todos.map((todo) => {
              return todo.id === e.todo.id
                ? { ...todo, ...e.todo, ref: todo.ref }
                : todo;
            }),
        }),
        "persist",
      ],
    },
    "TODO.DELETE": {
      actions: [
        assign({
          todos: (ctx, e) => ctx.todos.filter((todo) => todo.id !== e.id),
        }),
        "persist",
      ],
    },
    "SHOW.all": ".all",
    "SHOW.active": ".active",
    "SHOW.completed": ".completed",
    "MARK.completed": {
      actions: (ctx) => {
        ctx.todos.forEach((todo) => todo.ref.send("SET_COMPLETED"));
      },
    },
    "MARK.active": {
      actions: (ctx) => {
        ctx.todos.forEach((todo) => todo.ref.send("SET_ACTIVE"));
      },
    },
    CLEAR_COMPLETED: {
      actions: assign({
        todos: (ctx) => ctx.todos.filter((todo) => !todo.completed),
      }),
    },
  },
});
