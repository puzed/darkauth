export type ClientHooks = {
  fetchNoteDek?: (noteId: string) => Promise<string>;
  fetchWrappedEncPrivateJwk?: () => Promise<string>;
};

let hooks: ClientHooks = {};

export function setHooks(next: ClientHooks) {
  hooks = { ...hooks, ...next };
}

export function getHooks(): ClientHooks {
  return hooks;
}
