const OFFLINE_TIMEOUT_MS = 2500;
type NetworkListener = () => void;

const listeners = new Set<NetworkListener>();
let inferredReachability =
  typeof navigator === "undefined" ? true : navigator.onLine;
let browserEventsAttached = false;

function emitNetworkChange() {
  listeners.forEach((listener) => listener());
}

function setInferredReachability(next: boolean) {
  if (inferredReachability === next) return;
  inferredReachability = next;
  emitNetworkChange();
}

function attachBrowserNetworkEvents() {
  if (browserEventsAttached || typeof window === "undefined") {
    return;
  }

  browserEventsAttached = true;
  window.addEventListener("online", () => {
    setInferredReachability(true);
  });
  window.addEventListener("offline", () => {
    setInferredReachability(false);
  });
}

export function subscribeToNetworkStatus(listener: NetworkListener) {
  attachBrowserNetworkEvents();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNetworkStatusSnapshot() {
  attachBrowserNetworkEvents();

  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine && inferredReachability;
}

function createTimeoutError() {
  const error = new Error("Network timeout");
  error.name = "OfflineTimeoutError";
  return error;
}

export async function withNetworkTimeout<T>(
  task: PromiseLike<T> | T,
  timeoutMs = OFFLINE_TIMEOUT_MS,
): Promise<T> {
  try {
    const result = await Promise.race([
      Promise.resolve(task),
      new Promise<T>((_, reject) => {
        window.setTimeout(() => reject(createTimeoutError()), timeoutMs);
      }),
    ]);
    reportNetworkSuccess();
    return result;
  } catch (error) {
    reportNetworkFailure(error);
    throw error;
  }
}

export function isOfflineLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "OfflineTimeoutError" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("load failed")
  );
}

export function reportNetworkSuccess() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  setInferredReachability(true);
}

export function reportNetworkFailure(error?: unknown) {
  if (error !== undefined && !isOfflineLikeError(error)) {
    return;
  }

  setInferredReachability(false);
}

export async function trackedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);
    reportNetworkSuccess();
    return response;
  } catch (error) {
    reportNetworkFailure(error);
    throw error;
  }
}
