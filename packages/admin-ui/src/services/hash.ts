export async function sha256Base64Url(
  data: Uint8Array | ArrayBuffer | number[] | string
): Promise<string> {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (Array.isArray(data)) {
    bytes = new Uint8Array(data);
  } else if (typeof data === "string") {
    // Interpret as base64url or base64 string
    const base64 = data
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(data.length + ((4 - (data.length % 4)) % 4), "=");
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    bytes = arr;
  } else {
    throw new Error("Unsupported data type for sha256Base64Url");
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const out = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
