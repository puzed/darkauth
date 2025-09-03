/**
 * Client-side OPAQUE implementation for Auth UI
 * Uses the Cloudflare opaque-ts library
 * RFC 9380 compliant implementation
 */

// Re-export from the new cloudflare implementation
export * from "./opaque-cloudflare";

import opaqueService from "./opaque-cloudflare";
export { opaqueService };
export default opaqueService;
