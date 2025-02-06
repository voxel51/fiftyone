import { Lookers } from "@fiftyone/state";
import { v4 as uuid } from "uuid";
import { ProcessSample } from ".";
import { Coloring, Sample } from "..";
import { LookerUtils } from "../lookers/shared";
import { createWorker } from "../util";

export type AsyncLabelsRenderingJob = {
  sample: Sample;
  labels: string[];
  lookerRef: Lookers;
  resolve: (data: Omit<WorkerResponse, "uuid">) => void;
  reject: (error: Error) => void;
};

export type AsyncJobResolutionResult = {
  sample: Sample;
  coloring: Coloring;
};

export type WorkerResponse = {
  sample: Sample;
  coloring: Coloring;
  uuid: string;
};

const MAX_WORKERS =
  typeof window !== "undefined" ? navigator.hardwareConcurrency || 4 : 0;

// global job queue and indexes
const jobQueue: AsyncLabelsRenderingJob[] = [];
const pendingJobs = new Map<Sample, AsyncLabelsRenderingJob>();
const processingSamples = new Set<Sample>();

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

  // filter sample to only include keys in job.labels
  const pluckRelevant = (sample: Sample, frames = false) => {
    const filtered = { ...sample };
    Object.keys(filtered).forEach((key) => {
      if (!job.labels.includes(frames ? `frames.${key}` : key)) {
        if (!frames && key === "frames") {
          return;
        }
        delete filtered[key];
      }
    });

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
    sample: filteredSample as ProcessSample["sample"],
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
        // merge / replace pending job for the same sample
        pendingJob.labels = [...new Set([...pendingJob.labels, ...labels])];
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
