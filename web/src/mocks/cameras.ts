import type { Simulated } from "./simulated";

export interface SimulatedCameraStream {
  readonly id: string;
  readonly name: string;
  readonly streamKind: "plate" | "scene";
  readonly mode: "SIMULATED" | "UNCONFIGURED";
  readonly frameCaption: string;
}

export interface SimulatedDetection {
  readonly id: string;
  readonly atUtc: string;
  readonly cameraId: string;
  readonly plateText: string;
  readonly confidence: number;
  readonly matchedCredential: "match" | "no-match" | "not-tried";
}

export const simulatedCameras: Simulated<readonly SimulatedCameraStream[]> = {
  source: "simulated",
  data: [
    {
      id: "cam-1",
      name: "Entrance plate camera (sim)",
      streamKind: "plate",
      mode: "SIMULATED",
      frameCaption: "Last simulated frame: plate Placeholder-7, queue depth 1",
    },
    {
      id: "cam-2",
      name: "Driveway scene camera (sim)",
      streamKind: "scene",
      mode: "SIMULATED",
      frameCaption: "Last simulated frame: vehicle crossing zone B",
    },
  ],
};

export const simulatedDetections: Simulated<readonly SimulatedDetection[]> = {
  source: "simulated",
  data: [
    {
      id: "det-1",
      atUtc: "2026-10-19T12:31:00Z",
      cameraId: "cam-1",
      plateText: "Loc-P-99",
      confidence: 0.87,
      matchedCredential: "match",
    },
    {
      id: "det-2",
      atUtc: "2026-10-19T12:18:22Z",
      cameraId: "cam-1",
      plateText: "Loc-X-42",
      confidence: 0.41,
      matchedCredential: "no-match",
    },
    {
      id: "det-3",
      atUtc: "2026-10-19T12:02:02Z",
      cameraId: "cam-2",
      plateText: "Loc-U-13",
      confidence: 0.62,
      matchedCredential: "not-tried",
    },
  ],
};
