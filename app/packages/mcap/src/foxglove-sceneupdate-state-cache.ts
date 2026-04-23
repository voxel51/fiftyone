import type { Scene3dFrame } from "./archetypes";
import { BoundedLruCache } from "./bounded-lru-cache";
import { decodeFoxgloveSceneUpdatePayload } from "./foxglove-sceneupdate-decoder";
import { composeScene3dFrame } from "./transform-runtime";
import type { MultimodalRawMessage, MultimodalTimeRange } from "./types";
import { MultimodalRawMessageWindowCache } from "./raw-message-window-cache";

const SCENE_ENTITY_DELETION_MATCHING_ID = 0;
const SCENE_ENTITY_DELETION_ALL = 1;

type DecodedSceneUpdateResult = Awaited<
  ReturnType<typeof decodeFoxgloveSceneUpdatePayload>
>;

type SceneEntityRecord = DecodedSceneUpdateResult["entities"][number] & {
  cacheKey: string;
};

type SceneStateCheckpoint = {
  entities: Map<string, SceneEntityRecord>;
  messageIndex: number;
};

export type DecodedFoxgloveSceneFrame = {
  frame: Scene3dFrame;
  warnings: string[];
};

type FoxgloveSceneUpdateStateCacheOptions = ConstructorParameters<
  typeof MultimodalRawMessageWindowCache
>[0] & {
  maxDecodedUpdateEntries?: number;
  maxCheckpointEntries?: number;
};

function cloneEntityMap(entities: Map<string, SceneEntityRecord>) {
  return new Map(entities);
}

function getSharedFrameId(records: SceneEntityRecord[]) {
  const firstFrameId = records[0]?.frameId ?? null;
  if (!firstFrameId) {
    return null;
  }

  return records.every((record) => (record.frameId ?? null) === firstFrameId)
    ? firstFrameId
    : null;
}

function applyDeletion(
  entities: Map<string, SceneEntityRecord>,
  deletion: DecodedSceneUpdateResult["deletions"][number]
) {
  const nextKeysToDelete: string[] = [];

  entities.forEach((record, key) => {
    if (record.timestampNs > deletion.timestampNs) {
      return;
    }

    if (
      deletion.type === SCENE_ENTITY_DELETION_MATCHING_ID &&
      record.id !== deletion.id
    ) {
      return;
    }

    if (
      deletion.type !== SCENE_ENTITY_DELETION_MATCHING_ID &&
      deletion.type !== SCENE_ENTITY_DELETION_ALL
    ) {
      return;
    }

    nextKeysToDelete.push(key);
  });

  nextKeysToDelete.forEach((key) => {
    entities.delete(key);
  });
}

function applySceneUpdate(
  entities: Map<string, SceneEntityRecord>,
  update: DecodedSceneUpdateResult,
  message: MultimodalRawMessage
) {
  update.deletions.forEach((deletion) => {
    applyDeletion(entities, deletion);
  });

  update.entities.forEach((entity, index) => {
    const cacheKey =
      entity.id || `${message.messageId}:entity:${index.toString(10)}`;
    entities.set(cacheKey, {
      ...entity,
      cacheKey,
    });
  });
}

export class FoxgloveSceneUpdateStateCache {
  private readonly rawWindowCache: MultimodalRawMessageWindowCache;
  private readonly sceneRange: MultimodalTimeRange;
  private readonly decodedUpdates: BoundedLruCache<
    string,
    DecodedSceneUpdateResult
  >;
  private readonly pendingUpdates = new Map<
    string,
    Promise<DecodedSceneUpdateResult>
  >();
  private readonly checkpoints: BoundedLruCache<number, SceneStateCheckpoint>;
  private indexedMessagesVersion = -1;
  private indexedMessages: MultimodalRawMessage[] = [];
  private messageIndexById = new Map<string, number>();
  private ensuredThroughNs = Number.NEGATIVE_INFINITY;
  private currentReplayState: SceneStateCheckpoint & {
    messageId: string | null;
  } = {
    entities: new Map<string, SceneEntityRecord>(),
    messageId: null,
    messageIndex: -1,
  };

  constructor(options: FoxgloveSceneUpdateStateCacheOptions) {
    this.rawWindowCache = new MultimodalRawMessageWindowCache(options);
    this.sceneRange = options.sceneRange;
    this.decodedUpdates = new BoundedLruCache({
      maxEntries: options.maxDecodedUpdateEntries ?? 128,
    });
    this.checkpoints = new BoundedLruCache({
      maxEntries: options.maxCheckpointEntries ?? 64,
    });
  }

  async ensureRange(range: MultimodalTimeRange) {
    await this.rawWindowCache.ensureRange(range);
  }

  primeMessages(
    messages: MultimodalRawMessage[],
    window?: MultimodalTimeRange
  ) {
    this.rawWindowCache.primeMessages(messages, window);
  }

  getMessageForLogTime(logTimeNs: number) {
    return this.rawWindowCache.getMessageForLogTime(logTimeNs);
  }

  getSyncSamples() {
    return this.rawWindowCache.getSyncSamples();
  }

  getSyncTimestamps() {
    return this.rawWindowCache.getSyncTimestamps();
  }

  getVersion() {
    return this.rawWindowCache.getVersion();
  }

  getMessageReadiness(logTimeNs: number) {
    return this.rawWindowCache.getTimeReadiness(logTimeNs);
  }

  getMessagesAroundLogTime(
    logTimeNs: number,
    options: { aheadCount?: number; behindCount?: number } = {}
  ) {
    return this.rawWindowCache.getMessagesAroundLogTime(logTimeNs, options);
  }

  async decodeMessage(
    message: MultimodalRawMessage
  ): Promise<DecodedFoxgloveSceneFrame> {
    await this.ensureReplayRange(message.syncTimestampNs);

    const { messageIndexById, messages } = this.getIndexedMessages();
    const targetIndex = messageIndexById.get(message.messageId) ?? -1;
    if (targetIndex < 0) {
      return {
        frame: composeScene3dFrame({
          id: message.messageId,
          frameId: null,
          primitives: [],
        }),
        warnings: [],
      };
    }

    const replayState = this.getReplayState(targetIndex);
    const entities = cloneEntityMap(replayState.entities);
    const startIndex = replayState.messageIndex + 1;

    for (let index = startIndex; index <= targetIndex; index += 1) {
      const currentMessage = messages[index];
      const update = await this.decodeUpdate(currentMessage);
      applySceneUpdate(entities, update, currentMessage);
      this.checkpoints.set(index, {
        messageIndex: index,
        entities: cloneEntityMap(entities),
      });
    }

    this.maybeAdvanceReplayState(targetIndex, message.messageId, entities);

    const activeEntities = Array.from(entities.values()).filter((entity) => {
      return (
        entity.expiresAtNs === null ||
        entity.expiresAtNs > message.syncTimestampNs
      );
    });
    const warnings = Array.from(
      new Set(activeEntities.flatMap((entity) => entity.warnings))
    );

    return {
      frame: composeScene3dFrame({
        id: message.messageId,
        frameId: getSharedFrameId(activeEntities),
        primitives: activeEntities.flatMap((entity) => entity.primitives),
      }),
      warnings,
    };
  }

  dispose() {
    this.pendingUpdates.clear();
    this.decodedUpdates.clear();
    this.checkpoints.clear();
    this.indexedMessagesVersion = -1;
    this.indexedMessages = [];
    this.messageIndexById.clear();
    this.ensuredThroughNs = Number.NEGATIVE_INFINITY;
    this.currentReplayState = {
      entities: new Map<string, SceneEntityRecord>(),
      messageId: null,
      messageIndex: -1,
    };
    this.rawWindowCache.dispose();
  }

  private decodeUpdate(message: MultimodalRawMessage) {
    const cachedUpdate = this.decodedUpdates.get(message.messageId);
    if (cachedUpdate) {
      return Promise.resolve(cachedUpdate);
    }

    const existingUpdate = this.pendingUpdates.get(message.messageId);
    if (existingUpdate) {
      return existingUpdate;
    }

    const decodePromise = Promise.resolve(
      decodeFoxgloveSceneUpdatePayload(message.payload)
    )
      .then((decodedUpdate) => {
        this.decodedUpdates.set(message.messageId, decodedUpdate);
        return decodedUpdate;
      })
      .finally(() => {
        this.pendingUpdates.delete(message.messageId);
      });
    this.pendingUpdates.set(message.messageId, decodePromise);
    return decodePromise;
  }

  private getNearestCheckpoint(targetIndex: number) {
    let nearestCheckpoint: SceneStateCheckpoint | null = null;

    this.checkpoints.forEach((checkpoint, index) => {
      if (index > targetIndex) {
        return;
      }

      if (
        !nearestCheckpoint ||
        checkpoint.messageIndex > nearestCheckpoint.messageIndex
      ) {
        nearestCheckpoint = checkpoint;
      }
    });

    return nearestCheckpoint;
  }

  private async ensureReplayRange(targetTimestampNs: number) {
    const clampedTimestampNs = Math.max(
      this.sceneRange.startNs,
      targetTimestampNs
    );
    if (clampedTimestampNs <= this.ensuredThroughNs) {
      return;
    }

    await this.rawWindowCache.ensureRange({
      startNs:
        this.ensuredThroughNs > Number.NEGATIVE_INFINITY
          ? this.ensuredThroughNs
          : this.sceneRange.startNs,
      endNs: clampedTimestampNs,
    });
    this.ensuredThroughNs = clampedTimestampNs;
  }

  private getIndexedMessages() {
    const nextVersion = this.rawWindowCache.getVersion();
    if (nextVersion !== this.indexedMessagesVersion) {
      this.indexedMessages = this.rawWindowCache.getMessages();
      this.messageIndexById = new Map(
        this.indexedMessages.map((message, index) => [message.messageId, index])
      );
      this.indexedMessagesVersion = nextVersion;
      this.currentReplayState = {
        ...this.currentReplayState,
        messageIndex: this.currentReplayState.messageId
          ? this.messageIndexById.get(this.currentReplayState.messageId) ?? -1
          : -1,
      };
    }

    return {
      messages: this.indexedMessages,
      messageIndexById: this.messageIndexById,
    };
  }

  private getReplayState(targetIndex: number) {
    if (
      this.currentReplayState.messageIndex >= 0 &&
      targetIndex >= this.currentReplayState.messageIndex
    ) {
      return this.currentReplayState;
    }

    return (
      this.getNearestCheckpoint(targetIndex) ?? {
        entities: new Map<string, SceneEntityRecord>(),
        messageId: null,
        messageIndex: -1,
      }
    );
  }

  private maybeAdvanceReplayState(
    targetIndex: number,
    messageId: string,
    entities: Map<string, SceneEntityRecord>
  ) {
    if (targetIndex < this.currentReplayState.messageIndex) {
      return;
    }

    this.currentReplayState = {
      entities: cloneEntityMap(entities),
      messageId,
      messageIndex: targetIndex,
    };
  }
}
