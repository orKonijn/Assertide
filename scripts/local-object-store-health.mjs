export async function requireLocalObjectStore(fetchHealth = fetch) {
  try {
    const response = await fetchHealth('http://127.0.0.1:9000/minio/health/ready', {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (cause) {
    throw new Error(
      'Local report storage is unavailable at 127.0.0.1:9000. Restart the app to start local MinIO automatically. Existing reports require the saved storage data and credentials.',
      { cause },
    );
  }
}
