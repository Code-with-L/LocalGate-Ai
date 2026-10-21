import type {
  DeviceStatus,
  DomainObservable,
  EventSource,
  Result,
  SafetyReportedState,
} from "../domain/primitives";
import type { GateActuationState } from "../domain/gate";

export const GATEHEAD_CONTRACT_VERSION = "GATEHEAD/v1" as const;

export type GateCommand =
  | { readonly type: "OPEN" }
  | { readonly type: "CLOSE" }
  | { readonly type: "HALT" }
  | { readonly type: "RESUME" };

export type GateOperatorCapabilityReport = {
  readonly open: boolean;
  readonly close: boolean;
  readonly halt: boolean;
  readonly position_report: "NONE" | "COARSE";
};

export interface GateOperatorAck {
  readonly commandId: string;
  readonly acknowledgedAtUtc: string;
}

export type GateOperatorError =
  | { kind: "OPERATOR_UNREACHABLE" }
  | { kind: "STATE_CLAIM_MISMATCH" }
  | { kind: "COMMAND_UNSUPPORTED" };

export interface GateCommandOpts {
  readonly readyState: GateActuationState;
}

export type OperatorStatus = DeviceStatus<{
  gate_actuation_state: GateActuationState;
  reported_position: "OPEN" | "CLOSED" | "IN_MOTION";
}>;

export interface GateOperatorAdapter {
  readonly kind: "GateOperator";
  readonly adapter_contract_version: "GATEHEAD/v1";
  readonly gateId: string;
  readonly capabilities: GateOperatorCapabilityReport;
  status(): Promise<OperatorStatus>;
  stateExpose(): DomainObservable<OperatorStatus>;
  command(
    cmd: GateCommand,
    opts?: GateCommandOpts,
  ): Promise<Result<GateOperatorAck, GateOperatorError>>;
}

export type SafetyDeviceKind = "PHOTOCELL" | (string & {});

export type SafetyDeviceStatus = DeviceStatus<{ reported_state: SafetyReportedState }>;

export type SafetyEdgeEvent = {
  readonly deviceType: SafetyDeviceKind;
  readonly kind: "SAFETY_TRIGGERED" | "SAFETY_CLEARED";
  readonly occurredAtUtc: string;
  readonly source: EventSource;
};

export interface SafetyDeviceAdapter {
  readonly kind: "SafetyDevice";
  readonly device_type: SafetyDeviceKind;
  readonly adapter_contract_version: "GATEHEAD/v1";
  status(): Promise<SafetyDeviceStatus>;
  events(): DomainObservable<SafetyEdgeEvent>;
}

export type CameraStreamId = string;

export type CameraStatus = DeviceStatus<{ streams: CameraStreamId[] }>;

export type CameraSnapshotOpts = { readonly trigger?: "post-command" | "post-detection" };

export type SnapshotOutput =
  { phase: "available"; ref: string } | { phase: "unavailable"; reason: string };

export type SnapshotRef = { phase: "available"; ref: string } | { phase: "unavailable" };

export type SnapshotError = { kind: "UNAVAILABLE"; reason: string };

export interface CameraAdapter {
  readonly kind: "Camera";
  readonly adapter_contract_version: "GATEHEAD/v1";
  readonly cameraId: string;
  status(): Promise<CameraStatus>;
  snapshot(opts?: CameraSnapshotOpts): Promise<Result<SnapshotOutput, SnapshotError>>;
}

export type AnprConnectError = { kind: "PROVIDER_REFUSED" } | { kind: "NOT_CONFIGURED" };

export type AnprError =
  { kind: "NOT_CONNECTED" } | { kind: "INGEST_LIMIT_EXCEEDED"; limit: number };

export interface AnprSession {
  readonly providerName: string;
}

export interface FrameRef {
  readonly cameraStreamId: CameraStreamId;
  readonly frameKey: string;
}

export interface PlateCandidate {
  readonly plateRaw: string;
  readonly confidence: number;
  readonly frameRefId: string;
}

export const ANPR_INGEST_LIMIT = 32;

export interface AnprProvider {
  readonly kind: "AnprProvider";
  readonly adapter_contract_version: "GATEHEAD/v1";
  connect(providerConfig: string): Promise<Result<AnprSession, AnprConnectError>>;
  ingest(frameRef: FrameRef): Promise<Result<PlateCandidate[], AnprError>>;
}
