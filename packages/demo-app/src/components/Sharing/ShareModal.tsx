import { deriveDek } from "@DarkAuth/client";
import { CompactEncrypt, importJWK, type JWK } from "jose";
import { Check, Loader2, Search, UserPlus, X } from "lucide-react";
import React from "react";
import { api, type UserProfile } from "../../services/api";
import { logger } from "../../services/logger";
import { useAuthStore } from "../../stores/authStore";

interface Props {
  noteId: string;
  onClose: () => void;
}

export function ShareModal({ noteId, onClose }: Props) {
  const { session } = useAuthStore();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<UserProfile[]>([]);
  const [selected, setSelected] = React.useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  React.useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    logger.debug({ query: query.trim() }, "[ShareModal] search start");
    api
      .searchUsers(query.trim())
      .then((users) => {
        if (!active) return;
        setResults(users);
        logger.debug({ count: users.length, users }, "[ShareModal] search results");
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [query]);

  const toggleSelect = (u: UserProfile) => {
    setSelected((prev) => {
      const next = { ...prev } as Record<string, UserProfile>;
      if (next[u.sub]) delete next[u.sub];
      else next[u.sub] = u;
      logger.debug({ sub: u.sub, selected: !!next[u.sub] }, "[ShareModal] toggle select");
      return next;
    });
  };

  const handleShare = async () => {
    if (!session?.drk) return;
    const users = Object.values(selected);
    if (users.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const dek = await deriveDek(session.drk, noteId);
      const withKeys = users.filter((u) => !!u.public_key_jwk);
      const withoutKeys = users.filter((u) => !u.public_key_jwk);
      if (withoutKeys.length > 0) {
        logger.warn(
          {
            subs: withoutKeys.map((u) => u.sub),
          },
          "[ShareModal] some users missing public_key_jwk"
        );
      }
      if (withKeys.length === 0) {
        setError("Selected users have not set up encryption keys yet");
        return;
      }
      const results = await Promise.allSettled(
        withKeys.map(async (u) => {
          logger.debug({ sub: u.sub }, "[ShareModal] encrypting DEK for user");
          const pub = await importJWK(u.public_key_jwk as unknown as JWK, "ECDH-ES");
          const jwe = await new CompactEncrypt(dek)
            .setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM" })
            .encrypt(pub as CryptoKey);
          logger.debug({ sub: u.sub }, "[ShareModal] calling share API");
          await api.shareNote(noteId, u.sub, jwe, "write");
          logger.debug({ sub: u.sub }, "[ShareModal] share API done");
          return u.sub;
        })
      );
      const failures = results.filter((r) => r.status === "rejected");
      const successes = results.filter((r) => r.status === "fulfilled");
      if (successes.length > 0) {
        logger.debug(
          {
            successes: successes.length,
            failures: failures.length,
          },
          "[ShareModal] share completed"
        );
        onClose();
      } else {
        setError("Failed to share with selected users");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to share";
      setError(message);
      logger.error(e, "[ShareModal] share error");
    } finally {
      setLoading(false);
    }
  };

  const selectedList = Object.values(selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-800 rounded-xl shadow-xl w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <UserPlus className="w-5 h-5" />
            Share Note
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-3 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by name"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-dark-700 bg-white dark:bg-dark-900 outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {selectedList.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedList.map((u) => (
              <div
                key={u.sub}
                className="px-2 py-1 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-md text-sm flex items-center gap-2"
              >
                <span>{u.display_name || u.sub}</span>
                <button type="button" onClick={() => toggleSelect(u)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="max-h-60 overflow-y-auto rounded-md border border-gray-200 dark:border-dark-700">
          {searching && (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          )}
          {!searching && results.length === 0 && (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">No results</div>
          )}
          {!searching && results.length > 0 && (
            <ul>
              {results.map((u) => {
                const isSel = !!selected[u.sub];
                return (
                  <button
                    key={u.sub}
                    type="button"
                    onClick={() => toggleSelect(u)}
                    className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-dark-700 flex items-center justify-center text-sm">
                        {(u.display_name || "").slice(0, 1) || "?"}
                      </div>
                      <div className="text-sm">
                        <div className="text-gray-900 dark:text-white">
                          {u.display_name || u.sub}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs">{u.sub}</div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center ${isSel ? "bg-primary-600 border-primary-600" : "border-gray-300 dark:border-dark-600"}`}
                    >
                      {isSel && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </ul>
          )}
        </div>

        {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={loading || selectedList.length === 0}
            className="btn-primary disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
