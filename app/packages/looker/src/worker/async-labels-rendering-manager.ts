import { Lookers } from "@fiftyone/state";
import { v4 as uuid } from "uuid";
import { ProcessSample } from ".";
import { LookerUtils } from "../lookers/shared";
import { createWorker } from "../util";

type AsyncLabelsRenderingJob = {
  sample: any;
  labels: string[];
  lookerRef: Lookers;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
};

type AsyncJobResolutionResult = {
  sample: any;
  coloring: any;
};

const MAX_WORKERS =
  typeof window !== "undefined" ? navigator.hardwareConcurrency || 4 : 0;

// Global job queue and indexes for managing overlay rendering jobs.
const jobQueue: AsyncLabelsRenderingJob[] = [];
// Map of pending (not yet started) jobs keyed by sample.
const pendingJobs = new Map<string, AsyncLabelsRenderingJob>();
// Set of samples that are currently being processed.
const processingSamples = new Set<string>();

const workerPool: Worker[] = Array.from({ length: MAX_WORKERS }, () =>
  createWorker(LookerUtils.workerCallbacks)
);
const freeWorkers: Worker[] = workerPool.slice();

/**
 * Process the global jobQueue.
 *
 * This function iterates over pending jobs and assings any job
 * whose sample is not already being being processed by a free worker.
 */
const processQueue = () => {
  let jobAssigned = true;

  while (freeWorkers.length && jobAssigned) {
    jobAssigned = false;

    for (let i = 0; i < jobQueue.length; i++) {
      const job = jobQueue[i];
      if (!processingSamples.has(job.sample)) {
        // Remove job from the queue and pendingJobs map.
        jobQueue.splice(i, 1);
        // note: object equality makes sense here
        if (pendingJobs.get(job.sample) === job) {
          pendingJobs.delete(job.sample);
        }
        // Mark this sample as in-progress.
        processingSamples.add(job.sample);
        assignJobToFreeWorker(job);
        jobAssigned = true;
        // restart while loop because we've modified the jobQueue
        // let's restart search
        break;
      }
    }
  }
};

const assignJobToFreeWorker = (job: AsyncLabelsRenderingJob) => {
  const worker = freeWorkers.shift();

  const messageUuid = uuid();

  const handleMessage = (e) => {
    const { sample, coloring, uuid } = e.data;
    if (uuid !== messageUuid) return;

    cleanup();

    // we need to merge sample with the original sample
    // because the worker only returns the modified sample
    // we need to merge it with the original sample
    // shallow merge
    const mergedSample = { ...job.sample, ...sample };

    job.resolve({ sample: mergedSample, coloring });
    processingSamples.delete(job.sample);
    freeWorkers.push(worker);
    processQueue();
  };

  const handleError = (error) => {
    cleanup();
    job.reject(error);
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

  // omit the sample so that we don't send the entire sample to the worker
  // if anything is not in job.labels, it will be removed from the sample
  const sample = { ...job.sample };
  Object.entries(sample).forEach(([key]) => {
    if (!job.labels.includes(key)) {
      delete sample[key];
    }
  });

  const workerArgs = {
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
  } as ProcessSample;

  worker.postMessage(workerArgs);
};

export class AsyncLabelsRenderingManager {
  #lookerRef: Lookers;

  constructor(lookerRef: Lookers) {
    this.#lookerRef = lookerRef;
  }

  /**
   * Add a new item to job queue.
   */
  enqueueLabelPaintingJob(
    item: Omit<AsyncLabelsRenderingJob, "resolve" | "reject" | "lookerRef">
  ) {
    console.log(">>> enqueueLabelPaintingJob", item);
    const { sample, labels } = item;

    return new Promise<AsyncJobResolutionResult>((resolve, reject) => {
      const pendingJob = pendingJobs.get(sample);

      if (pendingJob) {
        // replace with new job
        pendingJob.labels = labels;
        pendingJob.resolve = resolve;
        pendingJob.reject = reject;
      } else {
        // no pending job exists for this sample.
        const job: AsyncLabelsRenderingJob = {
          sample,
          labels,
          lookerRef: this.#lookerRef,
          resolve,
          reject,
        };
        // register this job as pending.
        pendingJobs.set(sample, job);
        jobQueue.push(job);
        processQueue();
      }
    });
  }

  isProcessing() {
    return jobQueue.length > 0;
  }
}
