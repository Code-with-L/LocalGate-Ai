export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value });

export const err = <E>(error: E): { readonly ok: false; readonly error: E } => ({
  ok: false,
  error,
});

export type OperatingMode = "SIMULATED" | "UNCONFIGURED" | "LIVE";

export type EventSource = "simulated" | "live" | "imported";

export type DeviceHealth = "HEALTHY" | "DEGRADED" | "UNHEALTHY";

export type DeviceConnectivity = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";

export type DeviceConfigValidity = "VALID" | "INVALID" | "UNKNOWN";

export interface DeviceStatus<O> {
  readonly mode: OperatingMode;
  readonly health: DeviceHealth;
  readonly connectivity: DeviceConnectivity;
  readonly config_validity: DeviceConfigValidity;
  readonly last_reported_at: string;
  readonly oxidation: O;
}

export interface DomainClock {
  nowMs(): number;
}

export interface DomainSubscription {
  unsubscribe(): void;
}

export interface DomainObservable<T> {
  subscribe(observer: (value: T) => void): DomainSubscription;
}

export function createDomainObservable<T>(): {
  observable: DomainObservable<T>;
  emit: (value: T) => void;
} {
  const listeners: Array<(value: T) => void> = [];
  return {
    observable: {
      subscribe(observer: (value: T) => void): DomainSubscription {
        listeners.push(observer);
        return {
          unsubscribe: (): void => {
            const index = listeners.indexOf(observer);
            if (index >= 0) {
              listeners.splice(index, 1);
            }
          },
        };
      },
    },
    emit: (value: T): void => {
      for (const observer of [...listeners]) {
        observer(value);
      }
    },
  };
}

export type SafetyReportedState = "CLEAR" | "TRIGGERED" | "UNCLEAR" | "UNKNOWN";

export function utcIsoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function msFromUtcIso(iso: string): number {
  return Date.parse(iso);
}

export function djb2Digest(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `djb2:${hex}`;
}
