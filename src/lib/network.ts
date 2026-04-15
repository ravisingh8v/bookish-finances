const OFFLINE_TIMEOUT_MS = 2500;

function createTimeoutError() {
  const error = new Error("Network timeout");
  error.name = "OfflineTimeoutError";
  return error;
}

export async function withNetworkTimeout<T>(
  task: Promise<T>,
  timeoutMs = OFFLINE_TIMEOUT_MS,
): Promise<T> {
  return await Promise.race([
    task,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(createTimeoutError()), timeoutMs);
    }),
  ]);
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
