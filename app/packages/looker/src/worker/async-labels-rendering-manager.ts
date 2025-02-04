import { Lookers } from "@fiftyone/state";
import { v4 as uuid } from "uuid";
import { ProcessSample } from ".";
import { LookerUtils } from "../lookers/shared";
import { createWorker } from "../util";

export type AsyncLabelsRenderingJob = {
  sample: any;
  labels: string[];
  lookerRef: Lookers;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
};

export type AsyncJobResolutionResult = {
  sample: any;
  coloring: any;
};

export type WorkerResponse = {
  sample: any;
  coloring: any;
  uuid: string;
};

const MAX_WORKERS =
  typeof window !== "undefined" ? navigator.hardwareConcurrency || 4 : 0;

// global job queue and indexes
const jobQueue: AsyncLabelsRenderingJob[] = [];
const pendingJobs = new Map<any, AsyncLabelsRenderingJob>();
const processingSamples = new Set<any>();

const workerPool: Worker[] = Array.from({ length: MAX_WORKERS }, () =>
  createWorker(LookerUtils.workerCallbacks)
);
const freeWorkers: Worker[] = workerPool.slice();

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

    job.resolve({ sample: mergedSample, coloring });
    processingSamples.delete(job.sample);
    freeWorkers.push(worker);
    processQueue();
  };

  const handleError = (error: ErrorEvent) => {
    cleanup();
    job.reject(new Error(error.message));
    processingSamples.delete(job.sample);
    freeWorkers.push(worker);
    processQueue();
  };

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleError);

  // filter sample to only include keys in job.labels.
  const sample = { ...job.sample };
  Object.keys(sample).forEach((key) => {
    if (!job.labels.includes(key)) {
      delete sample[key];
    }
  });

  const workerArgs: ProcessSample & { method: "processSample" } = {
    sample,
    method: "processSample",
    coloring: job.lookerRef.state.options.coloring,
    customizeColorSetting: job.lookerRef.state.options.customizeColorSetting,
    colorscale: job.lookerRef.state.options.colorscale,
    labelTagColors: job.lookerRef.state.options.labelTagColors,
    selectedLabelTags: job.lookerRef.state.options.selectedLabelTags,
    sources: job.lookerRef.state.config.sources,
    schema: job.lookerRef.state.config.fieldSchema,
    uuid: messageUuid,
    activePaths: job.lookerRef.state.options.activePaths,
  };

  worker.postMessage(workerArgs);
};

export class AsyncLabelsRenderingManager {
  #lookerRef: Lookers;

  constructor(lookerRef: Lookers) {
    this.#lookerRef = lookerRef;
  }

  /**
   * Enqueue a new overlay rendering job.
   * If a pending job exists for the same sample, update it.
   */
  enqueueLabelPaintingJob(
    item: Omit<AsyncLabelsRenderingJob, "resolve" | "reject" | "lookerRef">
  ): Promise<AsyncJobResolutionResult> {
    const { sample, labels } = item;

    return new Promise<AsyncJobResolutionResult>((resolve, reject) => {
      const pendingJob = pendingJobs.get(sample);
      if (pendingJob) {
        // replace the pending job with new labels and new promise callbacks.
        pendingJob.labels = labels;
        pendingJob.resolve = resolve;
        pendingJob.reject = reject;
      } else {
        const job: AsyncLabelsRenderingJob = {
          sample,
          labels,
          lookerRef: this.#lookerRef,
          resolve,
          reject,
        };
        pendingJobs.set(sample, job);
        jobQueue.push(job);
        processQueue();
      }
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
