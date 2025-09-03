// OPAQUE Client Service for Admin UI
// Uses the Cloudflare opaque-ts library for secure authentication

// Re-export from the new cloudflare implementation
export * from "./opaque-cloudflare";

import adminOpaqueService from "./opaque-cloudflare";
export { adminOpaqueService };
export default adminOpaqueService;
