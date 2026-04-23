import type { Scene3dFrame } from "./archetypes";
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
  private readonly decodedUpdates = new Map<
    string,
    Promise<DecodedSceneUpdateResult>
  >();
  private readonly checkpoints = new Map<number, SceneStateCheckpoint>();

  constructor(
    options: ConstructorParameters<typeof MultimodalRawMessageWindowCache>[0]
  ) {
    this.rawWindowCache = new MultimodalRawMessageWindowCache(options);
    this.sceneRange = options.sceneRange;
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
    await this.rawWindowCache.ensureRange({
      startNs: this.sceneRange.startNs,
      endNs: Math.max(this.sceneRange.startNs, message.syncTimestampNs),
    });

    const messages = this.rawWindowCache.getMessages();
    const targetIndex = messages.findIndex(
      (candidate) => candidate.messageId === message.messageId
    );
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

    const checkpoint = this.getNearestCheckpoint(targetIndex);
    const entities = checkpoint
      ? cloneEntityMap(checkpoint.entities)
      : new Map<string, SceneEntityRecord>();
    const startIndex = checkpoint ? checkpoint.messageIndex + 1 : 0;

    for (let index = startIndex; index <= targetIndex; index += 1) {
      const currentMessage = messages[index];
      const update = await this.decodeUpdate(currentMessage);
      applySceneUpdate(entities, update, currentMessage);
      this.checkpoints.set(index, {
        messageIndex: index,
        entities: cloneEntityMap(entities),
      });
    }

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
    this.decodedUpdates.clear();
    this.checkpoints.clear();
    this.rawWindowCache.dispose();
  }

  private decodeUpdate(message: MultimodalRawMessage) {
    const existingUpdate = this.decodedUpdates.get(message.messageId);
    if (existingUpdate) {
      return existingUpdate;
    }

    const decodePromise = Promise.resolve(
      decodeFoxgloveSceneUpdatePayload(message.payload)
    );
    this.decodedUpdates.set(message.messageId, decodePromise);
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
}
