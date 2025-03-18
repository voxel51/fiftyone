import {
  jotaiStore,
  numConcurrentRenderingLabels,
} from "@fiftyone/state/src/jotai";
import type { Schema } from "@fiftyone/utilities";
import { v4 as uuid } from "uuid";
import type { ProcessSample } from ".";
import type { Coloring, Sample } from "..";
import { LookerUtils } from "../lookers/shared";
import { retrieveTransferables } from "../lookers/utils";
import { accumulateOverlays } from "../overlays";
import type { SampleOptions, Sources } from "../state";
import { createWorker } from "../util";

export type AsyncLabelsRenderingJob<S extends Sample = Sample> = {
  labels: string[];
  options: SampleOptions;
  resolve: (data: Omit<WorkerResponse<S>, "uuid">) => void;
  reject: (error: Error) => void;
  sample: S;
  schema: Schema;
  sources: Sources;
};

export type AsyncJobResolutionResult<S extends Sample = Sample> = {
  sample: S;
  coloring: Coloring;
};

export type WorkerResponse<S extends Sample = Sample> = {
  sample: S;
  coloring: Coloring;
  uuid: string;
};

const MAX_WORKERS =
  typeof window !== "undefined" ? navigator.hardwareConcurrency || 4 : 0;

// global job queue and indexes
const jobQueue: AsyncLabelsRenderingJob[] = [];
const pendingJobs = new Map();
const processingSamples = new Set<Sample>();

const workerPool: Worker[] = Array.from({ length: MAX_WORKERS }, () =>
  createWorker(LookerUtils.workerCallbacks)
);
const freeWorkers: Worker[] = workerPool.slice();

const updateRenderingCount = (delta: number) => {
  jotaiStore.set(numConcurrentRenderingLabels, (curr) =>
    Math.max(0, curr + delta)
  );
};

/**
 * Process the global jobQueue: assign jobs (whose sample is not already
 * processing) to free workers.
 */
export const processQueue = () => {
  let jobAssigned = true;

  while (freeWorkers.length && jobAssigned) {
    jobAssigned = false;

    for (let i = 0; i < jobQueue.length; i++) {
      const job = jobQueue[i];
      if (!processingSamples.has(job.sample)) {
        jobQueue.splice(i, 1);
        // note: object equality makes sense here
        if (pendingJobs.get(job.sample) === job) {
          pendingJobs.delete(job.sample);
        }
        processingSamples.add(job.sample);
        assignJobToFreeWorker(job);
        jobAssigned = true;
        // restart search as jobQueue has been modified
        break;
      }
    }
  }
};

const assignJobToFreeWorker = (job: AsyncLabelsRenderingJob) => {
  const worker = freeWorkers.shift()!;
  const messageUuid = uuid();

  const handleMessage = (e: MessageEvent<WorkerResponse>) => {
    const { sample, coloring, uuid: resUuid } = e.data;
    if (resUuid !== messageUuid) return;

    cleanup();
    // shallow merge worker-returned sample with the original sample.
    const mergedSample = { ...job.sample, ...sample };

    // also merge frames if they exist
    if (job.sample.frames && sample.frames) {
      mergedSample.frames = job.sample.frames.map((frame, idx) => {
        return { ...frame, ...sample.frames[idx] };
      });
    }

    job.resolve({ sample: mergedSample, coloring });
    processingSamples.delete(job.sample);
    freeWorkers.push(worker);
    processQueue();

    updateRenderingCount(-1);
  };

  const handleError = (error: ErrorEvent) => {
    cleanup();
    job.reject(new Error(error.message));
    processingSamples.delete(job.sample);
    freeWorkers.push(worker);
    updateRenderingCount(-1);
    processQueue();
  };

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleError);

  // filter sample to only include keys in job.labels
  const pluckRelevant = (sample: Sample, frames = false) => {
    const filtered = { ...sample };
    for (const key of Object.keys(filtered)) {
      if (!job.labels.includes(frames ? `frames.${key}` : key)) {
        if (!frames && key === "frames") {
          continue;
        }
        delete filtered[key];
      }
    }

    if (filtered.frames?.length) {
      filtered.frames = filtered.frames.map((frame) => {
        return pluckRelevant(frame, true);
      });
    }
    return filtered;
  };

  const filteredSample = pluckRelevant(job.sample);

  const workerArgs: ProcessSample & { method: "processSample" } = {
    method: "processSample",
    options: job.options,
    sample: filteredSample as ProcessSample["sample"],
    schema: job.schema,
    sources: job.sources,
    uuid: messageUuid,
  };

  const { overlays: filteredOverlays } = accumulateOverlays(
    filteredSample,
    job.schema
  );
  const transfer = retrieveTransferables(filteredOverlays);

  worker.postMessage(workerArgs, transfer);

  updateRenderingCount(1);
};

export class AsyncLabelsRenderingManager<S extends Sample = Sample> {
  /**
   * Enqueue a new overlay rendering job.
   * If a pending job exists for the same sample, update it.
   */
  enqueueLabelPaintingJob(
    item: Omit<AsyncLabelsRenderingJob<S>, "resolve" | "reject">
  ): Promise<AsyncJobResolutionResult<S>> {
    const { labels, options, sample } = item;

    return new Promise<AsyncJobResolutionResult<S>>((resolve, reject) => {
      const pendingJob = pendingJobs.get(sample);
      if (pendingJob) {
        // merge / replace pending job for the same sample
        pendingJob.labels = [...new Set([...pendingJob.labels, ...labels])];
        pendingJob.resolve = resolve;
        pendingJob.reject = reject;
        return;
      }

      const job: AsyncLabelsRenderingJob<S> = {
        labels,
        options,
        resolve,
        reject,
        sample,
        schema: item.schema,
        sources: item.sources,
      };
      pendingJobs.set(sample, job);
      jobQueue.push(job);
      processQueue();
    });
  }

  isProcessing() {
    return jobQueue.length > 0 || processingSamples.size > 0;
  }
}

/**
 *  Meant for unit tests so that each test can start with a clean state
 */
export const _internal_resetForTests = () => {
  jobQueue.length = 0;
  pendingJobs.clear();
  processingSamples.clear();
  freeWorkers.splice(0, freeWorkers.length, ...workerPool);
};
