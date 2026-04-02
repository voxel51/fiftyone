/**
 * Redux store — hackday experiment.
 *
 * Scoped to the Annotation feature. Runs alongside Jotai/Recoil.
 */
import { configureStore } from "@reduxjs/toolkit";
import { fiftyoneApi } from "./api";

export const annotationStore = configureStore({
  reducer: {
    [fiftyoneApi.reducerPath]: fiftyoneApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(fiftyoneApi.middleware),
});

export type AnnotationRootState = ReturnType<typeof annotationStore.getState>;
export type AnnotationAppDispatch = typeof annotationStore.dispatch;
