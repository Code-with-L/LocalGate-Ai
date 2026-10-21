import type { PlateDetectionRecord } from "./detections";
import { isBelowAuthorizationThreshold } from "./detections";
import type { EventSource, Result } from "./primitives";
import { err, ok, utcIsoFromMs } from "./primitives";

export const PLATE_NORMALIZATION_VERSION = "plate-normalize/v1";

const NON_ALPHANUMERIC = /[^A-Z0-9]/g;

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(NON_ALPHANUMERIC, "");
}

export interface PlateAuthorization {
  readonly entityId: string;
  readonly entityType: "PlateAuthorization";
  readonly siteId: string;
  readonly plateRaw: string;
  readonly plateNormalized: string;
  readonly normalizationVersion: string;
  readonly visitorCredentialId: string | null;
  readonly createdAtUtc: string;
  readonly revokedAtUtc: string | null;
  readonly createdByOperatorId: string;
  readonly createdSource: EventSource;
  readonly sourceDetectionId: string;
}

export interface PlateAuthorizationInput {
  id: string;
  siteId: string;
  visitorCredentialId: string | null;
  createdByOperatorId: string;
  createdSource: EventSource;
  createdAtUtc: string;
}

export type PlateAuthorizationCreateError =
  | { kind: "detection-plate-missing"; detectionId: string }
  | { kind: "detection-below-confidence-threshold"; plateConfidence: number }
  | { kind: "plate-unrecognizable"; plateRaw: string };

export type PlateAuthorizationRevokeError =
  | { kind: "already-revoked"; revokedAtUtc: string }
  | { kind: "revoked-before-created"; revokedAtUtc: string; createdAtUtc: string };

export function createPlateAuthorizationFromDetection(
  detection: PlateDetectionRecord,
  input: PlateAuthorizationInput,
): Result<PlateAuthorization, PlateAuthorizationCreateError> {
  const plateRaw = detection.plateRaw;
  if (plateRaw === null) {
    return err({ kind: "detection-plate-missing", detectionId: detection.id });
  }
  if (isBelowAuthorizationThreshold(detection.plateConfidence)) {
    return err({
      kind: "detection-below-confidence-threshold",
      plateConfidence: detection.plateConfidence,
    });
  }
  const plateNormalized = normalizePlate(plateRaw);
  if (plateNormalized.length === 0) {
    return err({ kind: "plate-unrecognizable", plateRaw });
  }
  const authorization: PlateAuthorization = Object.freeze({
    entityId: input.id,
    entityType: "PlateAuthorization" as const,
    siteId: input.siteId,
    plateRaw,
    plateNormalized,
    normalizationVersion: PLATE_NORMALIZATION_VERSION,
    visitorCredentialId: input.visitorCredentialId,
    createdAtUtc: input.createdAtUtc,
    revokedAtUtc: null,
    createdByOperatorId: input.createdByOperatorId,
    createdSource: input.createdSource,
    sourceDetectionId: detection.id,
  });
  return ok(authorization);
}

export function isPlateAuthorizationActive(authorization: PlateAuthorization): boolean {
  return authorization.revokedAtUtc === null;
}

export function plateMatchesAuthorization(
  authorization: PlateAuthorization,
  plateNormalized: string,
): boolean {
  return (
    isPlateAuthorizationActive(authorization) && authorization.plateNormalized === plateNormalized
  );
}

export function revokePlateAuthorization(
  authorization: PlateAuthorization,
  nowMs: number,
): Result<PlateAuthorization, PlateAuthorizationRevokeError> {
  if (authorization.revokedAtUtc !== null) {
    return err({ kind: "already-revoked", revokedAtUtc: authorization.revokedAtUtc });
  }
  const revokedAtUtc = utcIsoFromMs(nowMs);
  if (revokedAtUtc < authorization.createdAtUtc) {
    return err({
      kind: "revoked-before-created",
      revokedAtUtc,
      createdAtUtc: authorization.createdAtUtc,
    });
  }
  return ok(Object.freeze({ ...authorization, revokedAtUtc }));
}
