import type { DeviceStatus, EventSource, OperatingMode, Result } from "./primitives";
import { err, ok } from "./primitives";

export type GateSide = "PASSENGER" | "DRIVER" | "PEDESTRIAN" | (string & {});

export const KNOWN_GATE_SIDES: readonly GateSide[] = ["PASSENGER", "DRIVER", "PEDESTRIAN"];

export interface Camera {
  readonly entityId: string;
  readonly entityType: "Camera";
  readonly siteId: string;
  readonly label: string;
  readonly gateSide: GateSide;
  readonly streamConfigRef: string;
  readonly mode: OperatingMode;
  readonly connectionProfile: string | null;
  readonly status: DeviceStatus<Record<string, string>>;
}

export interface CameraCreateInput {
  id: string;
  siteId: string;
  label: string;
  gateSide: GateSide;
  streamConfigRef: string;
  mode: OperatingMode;
  connectionProfile: string | null;
  status: DeviceStatus<Record<string, string>>;
}

export type CameraValidationError =
  | { kind: "label-empty" }
  | { kind: "stream-config-missing" }
  | { kind: "live-mode-requires-connection-profile" }
  | { kind: "connection-profile-without-live-mode" }
  | { kind: "status-mode-mismatch"; mode: OperatingMode; statusMode: OperatingMode };

export function createCamera(input: CameraCreateInput): Result<Camera, CameraValidationError> {
  const label = input.label.trim();
  if (label.length === 0) {
    return err({ kind: "label-empty" });
  }
  if (input.streamConfigRef.length === 0) {
    return err({ kind: "stream-config-missing" });
  }
  if (input.mode === "LIVE" && input.connectionProfile === null) {
    return err({ kind: "live-mode-requires-connection-profile" });
  }
  if (input.mode !== "LIVE" && input.connectionProfile !== null) {
    return err({ kind: "connection-profile-without-live-mode" });
  }
  if (input.status.mode !== input.mode) {
    return err({ kind: "status-mode-mismatch", mode: input.mode, statusMode: input.status.mode });
  }
  const camera: Camera = Object.freeze({
    entityId: input.id,
    entityType: "Camera" as const,
    siteId: input.siteId,
    label,
    gateSide: input.gateSide,
    streamConfigRef: input.streamConfigRef,
    mode: input.mode,
    connectionProfile: input.connectionProfile,
    status: input.status,
  });
  return ok(camera);
}

export interface CameraStream {
  readonly entityId: string;
  readonly entityType: "CameraStream";
  readonly cameraId: string;
  readonly startedAtUtc: string;
  readonly endedAtUtc: string | null;
  readonly source: EventSource;
  readonly codecInfo: string | null;
}

export interface CameraStreamOpenInput {
  id: string;
  cameraId: string;
  startedAtUtc: string;
  source: EventSource;
  codecInfo: string | null;
}

export type CameraStreamError =
  | { kind: "duplicate-stream-id"; streamId: string }
  | { kind: "camera-already-has-open-stream"; cameraId: string; openStreamId: string }
  | { kind: "stream-not-found"; streamId: string }
  | { kind: "stream-already-closed"; streamId: string }
  | { kind: "stream-camera-mismatch"; streamId: string; cameraId: string };

export interface CameraStreamStore {
  readonly streams: readonly CameraStream[];
  open(input: CameraStreamOpenInput): Result<CameraStream, CameraStreamError>;
  close(streamId: string, endedAtUtc: string): Result<CameraStream, CameraStreamError>;
  findOpenStream(cameraId: string): CameraStream | null;
}

export function isStreamOpen(stream: CameraStream): boolean {
  return stream.endedAtUtc === null;
}

export function createCameraStreamStore(): CameraStreamStore {
  const streams: CameraStream[] = [];

  function findOpen(cameraId: string): CameraStream | null {
    const open = streams.find((stream) => stream.cameraId === cameraId && isStreamOpen(stream));
    return open ?? null;
  }

  return {
    get streams(): readonly CameraStream[] {
      return [...streams];
    },
    open(input: CameraStreamOpenInput): Result<CameraStream, CameraStreamError> {
      if (streams.some((stream) => stream.entityId === input.id)) {
        return err({ kind: "duplicate-stream-id", streamId: input.id });
      }
      const existing = findOpen(input.cameraId);
      if (existing !== null) {
        return err({
          kind: "camera-already-has-open-stream",
          cameraId: input.cameraId,
          openStreamId: existing.entityId,
        });
      }
      const stream: CameraStream = Object.freeze({
        entityId: input.id,
        entityType: "CameraStream" as const,
        cameraId: input.cameraId,
        startedAtUtc: input.startedAtUtc,
        endedAtUtc: null,
        source: input.source,
        codecInfo: input.codecInfo,
      });
      streams.push(stream);
      return ok(stream);
    },
    close(streamId: string, endedAtUtc: string): Result<CameraStream, CameraStreamError> {
      const index = streams.findIndex((stream) => stream.entityId === streamId);
      const current = streams[index];
      if (current === undefined) {
        return err({ kind: "stream-not-found", streamId });
      }
      if (!isStreamOpen(current)) {
        return err({ kind: "stream-already-closed", streamId });
      }
      const closed: CameraStream = Object.freeze({ ...current, endedAtUtc });
      streams[index] = closed;
      return ok(closed);
    },
    findOpenStream: findOpen,
  };
}

export function bindSnapshotToStream(
  store: CameraStreamStore,
  cameraId: string,
  streamId: string,
): Result<CameraStream, CameraStreamError> {
  const stream = store.streams.find((candidate) => candidate.entityId === streamId);
  if (stream === undefined) {
    return err({ kind: "stream-not-found", streamId });
  }
  if (stream.cameraId !== cameraId) {
    return err({ kind: "stream-camera-mismatch", streamId, cameraId });
  }
  if (!isStreamOpen(stream)) {
    return err({ kind: "stream-already-closed", streamId });
  }
  return ok(stream);
}
