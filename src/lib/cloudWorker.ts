import { renderClouds, type CloudOptions } from "./cloudGen";

interface Job {
  index: number;
  w: number;
  h: number;
  opts: CloudOptions;
}

interface WorkerPort {
  onmessage: ((event: MessageEvent<Job>) => void) | null;
  postMessage: (message: unknown, transfer: ArrayBuffer[]) => void;
}

// Cloud textures are computed off the main thread, so scrolling never stalls while they are made.
const port = self as unknown as WorkerPort;

port.onmessage = (event) => {
  const { index, w, h, opts } = event.data;
  const pixels = renderClouds(w, h, opts);
  port.postMessage({ index, pixels }, [pixels.buffer as ArrayBuffer]);
};