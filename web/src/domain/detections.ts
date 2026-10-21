import type { Result } from "./primitives";
import { err, msFromUtcIso, ok } from "./primitives";

export type DetectionSource = "simulated" | "frigate" | "onnx" | "imported";

export interface PlateDetectionRecord {
  readonly id: string;
  readonly cameraId: string;
  readonly cameraStreamId: string | null;
  readonly firstSeenAtUtc: string;
  readonly lastConfirmedAtUtc: string | null;
  readonly plateRaw: string | null;
  readonly plateConfidence: number;
  readonly detectionSource: DetectionSource;
  readonly snapshotEvidenceRef: string | null;
}

export type DetectionAppendError =
  | { kind: "duplicate-detection-id"; id: string }
  | { kind: "confidence-out-of-range"; plateConfidence: number }
  | { kind: "out-of-order"; firstSeenAtUtc: string; lastAcceptedFirstSeenAtUtc: string | null };

export interface DetectionStore {
  readonly detections: readonly PlateDetectionRecord[];
  readonly lastAcceptedFirstSeenAtUtc: string | null;
}

export function createDetectionStore(): AppendableDetectionStore {
  const store: { detections: PlateDetectionRecord[]; lastAcceptedFirstSeenAtUtc: string | null } = {
    detections: [],
    lastAcceptedFirstSeenAtUtc: null,
  };
  return {
    get detections() {
      return [...store.detections];
    },
    get lastAcceptedFirstSeenAtUtc() {
      return store.lastAcceptedFirstSeenAtUtc;
    },
    append(record: PlateDetectionRecord): void {
      store.detections.push(Object.freeze(record));
      store.lastAcceptedFirstSeenAtUtc = record.firstSeenAtUtc;
    },
  };
}

export interface AppendableDetectionStore extends DetectionStore {
  append(record: PlateDetectionRecord): void;
}

export interface PlateDetectionEvent {
  readonly id: string;
  readonly cameraId: string;
  readonly cameraStreamId: string | null;
  readonly firstSeenAtUtc: string;
  readonly lastConfirmedAtUtc: string | null;
  readonly plateRaw: string | null;
  readonly plateConfidence: number;
  readonly detectionSource: DetectionSource;
  readonly snapshotEvidenceRef: string | null;
}

export function appendDetection(
  store: DetectionStore,
  append: (record: PlateDetectionRecord) => void,
  event: PlateDetectionEvent,
): Result<PlateDetectionRecord, DetectionAppendError> {
  const duplicate = store.detections.some((d) => d.id === event.id);
  if (duplicate) {
    return err({ kind: "duplicate-detection-id", id: event.id });
  }
  if (
    !Number.isFinite(event.plateConfidence) ||
    event.plateConfidence < 0 ||
    event.plateConfidence > 1
  ) {
    return err({ kind: "confidence-out-of-range", plateConfidence: event.plateConfidence });
  }
  const firstSeen = msFromUtcIso(event.firstSeenAtUtc);
  if (Number.isNaN(firstSeen)) {
    return err({
      kind: "out-of-order",
      firstSeenAtUtc: event.firstSeenAtUtc,
      lastAcceptedFirstSeenAtUtc: store.lastAcceptedFirstSeenAtUtc,
    });
  }
  if (store.lastAcceptedFirstSeenAtUtc !== null) {
    const lastAccepted = msFromUtcIso(store.lastAcceptedFirstSeenAtUtc);
    if (!Number.isNaN(lastAccepted) && firstSeen < lastAccepted) {
      return err({
        kind: "out-of-order",
        firstSeenAtUtc: event.firstSeenAtUtc,
        lastAcceptedFirstSeenAtUtc: store.lastAcceptedFirstSeenAtUtc,
      });
    }
  }
  const record: PlateDetectionRecord = Object.freeze({ ...event });
  append(record);
  return ok(record);
}

const DISTINGUISHABILITY_CONFIDENCE_FLOOR = 0.6;

export function isBelowAuthorizationThreshold(
  plateConfidence: number,
  threshold: number = DISTINGUISHABILITY_CONFIDENCE_FLOOR,
): boolean {
  return plateConfidence < threshold;
}
