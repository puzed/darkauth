import { refreshSession } from "@DarkAuth/client";
import { z } from "zod";
import { logger } from "./logger";

type RuntimeConfig = { demoApi?: string; issuer?: string };
const runtimeConfiguration =
  (window as unknown as { __APP_CONFIG__?: RuntimeConfig }).__APP_CONFIG__ || {};
const demoApiBaseUrl = runtimeConfiguration.demoApi || "http://localhost:9094";
const darkauthApiBaseUrl = `${runtimeConfiguration.issuer || "http://localhost:9080"}/api`;

export interface Note {
  note_id: string;
  owner_sub: string;
  created_at: string;
  updated_at: string;
  title?: string;
  collection_id?: string;
}

export interface NoteChange {
  seq: number;
  ciphertext_b64: string;
  aad: unknown;
}

export interface UserProfile {
  sub: string;
  display_name?: string;
  avatar_url?: string;
  public_key_jwk: JsonWebKey;
  wrapped_private_key?: string;
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const idToken = sessionStorage.getItem("id_token");
    if (!idToken) throw new Error("No authentication token");

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    };

    let response = await fetch(`${demoApiBaseUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Try to refresh token
      const newSession = await refreshSession();
      if (newSession) {
        headers.Authorization = `Bearer ${newSession.idToken}`;
        response = await fetch(`${demoApiBaseUrl}${path}`, {
          ...options,
          headers,
        });
      } else {
        throw new Error("Authentication expired");
      }
    }

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch {}
      try {
        const parsed = errText ? JSON.parse(errText) : null;
        const msg = parsed?.error || `HTTP ${response.status}`;
        logger.error(
          {
            path,
            method: options.method || "GET",
            status: response.status,
            body: parsed || errText || null,
          },
          "[demo-api] request failed"
        );
        throw new Error(msg);
      } catch {
        logger.error(
          {
            path,
            method: options.method || "GET",
            status: response.status,
            body: errText || null,
          },
          "[demo-api] request failed"
        );
        throw new Error(`HTTP ${response.status}`);
      }
    }

    return response.json();
  }

  // User profile endpoints
  async getProfile(sub: string): Promise<UserProfile> {
    return this.request<UserProfile>(`/demo/users/${sub}`);
  }

  async updateProfile(profile: Partial<UserProfile>): Promise<{ success: boolean }> {
    const Resp = z.object({ success: z.boolean() });
    const response = await this.request<unknown>("/demo/users/me", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
    return Resp.parse(response);
  }

  async searchUsers(query: string): Promise<UserProfile[]> {
    const idToken = sessionStorage.getItem("id_token");
    const url = `${darkauthApiBaseUrl}/users/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const UsersResp = z.object({
      users: z
        .array(
          z.object({
            sub: z.string(),
            name: z.string().optional(),
            display_name: z.string().optional(),
            avatar_url: z.string().optional(),
            public_key_jwk: z.unknown(),
          })
        )
        .default([]),
    });
    const parsed = UsersResp.parse(await response.json());
    return parsed.users.map((u) => ({
      sub: u.sub,
      display_name: u.display_name || u.name,
      avatar_url: u.avatar_url,
      public_key_jwk: u.public_key_jwk as JsonWebKey,
    }));
  }

  // Notes endpoints
  async listNotes(): Promise<Note[]> {
    const NoteSchema = z.object({
      note_id: z.string(),
      owner_sub: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      title: z.string().optional(),
      collection_id: z.string().optional(),
    });
    const Resp = z.object({ notes: z.array(NoteSchema) });
    const response = await this.request<unknown>("/demo/notes");
    const parsed = Resp.parse(response);
    return parsed.notes;
  }

  async createNote(collectionId?: string): Promise<string> {
    const Resp = z.object({ note_id: z.string() });
    const response = await this.request<unknown>("/demo/notes", {
      method: "POST",
      body: JSON.stringify({ collection_id: collectionId }),
    });
    return Resp.parse(response).note_id;
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.request(`/demo/notes/${noteId}`, {
      method: "DELETE",
    });
  }

  async getNoteChanges(noteId: string, since = 0): Promise<NoteChange[]> {
    const Change = z.object({ seq: z.number(), ciphertext_b64: z.string(), aad: z.unknown() });
    const Resp = z.object({ changes: z.array(Change) });
    const response = await this.request<unknown>(`/demo/notes/${noteId}/changes?since=${since}`);
    return Resp.parse(response).changes as NoteChange[];
  }

  async appendNoteChange(
    noteId: string,
    ciphertextBase64: string,
    additionalAuthenticatedData: unknown
  ): Promise<void> {
    await this.request(`/demo/notes/${noteId}/changes`, {
      method: "POST",
      body: JSON.stringify({
        ciphertext_b64: ciphertextBase64,
        aad: additionalAuthenticatedData,
      }),
    });
  }

  async updateNoteMetadata(
    noteId: string,
    metadata: { title_ciphertext?: string; tags_ciphertext?: string }
  ): Promise<void> {
    const _ = await this.request<unknown>(`/demo/notes/${noteId}/metadata`, {
      method: "PUT",
      body: JSON.stringify(metadata),
    });
  }

  // Sharing endpoints
  async shareNote(
    noteId: string,
    recipientSub: string,
    dekJwe: string,
    grants: "read" | "write"
  ): Promise<void> {
    const Resp = z.object({ success: z.boolean() }).catch(() => ({ success: true }));
    const response = await this.request<unknown>(`/demo/notes/${noteId}/share`, {
      method: "POST",
      body: JSON.stringify({
        recipient_sub: recipientSub,
        dek_jwe: dekJwe,
        grants,
      }),
    });
    void Resp.parse(response);
  }

  async revokeNoteAccess(noteId: string, recipientSub: string): Promise<void> {
    const Resp = z.object({ success: z.boolean() }).catch(() => ({ success: true }));
    const response = await this.request<unknown>(
      `/demo/notes/${noteId}/share/${encodeURIComponent(recipientSub)}`,
      {
        method: "DELETE",
      }
    );
    void Resp.parse(response);
  }

  async getNoteDek(noteId: string): Promise<string> {
    const Resp = z.object({ dek_jwe: z.string() });
    const response = await this.request<unknown>(`/demo/notes/${noteId}/dek`);
    return Resp.parse(response).dek_jwe;
  }

  async getWrappedEncPrivateJwk(): Promise<string> {
    const idToken = sessionStorage.getItem("id_token");
    if (!idToken) throw new Error("No authentication token");
    const url = `${darkauthApiBaseUrl}/crypto/wrapped-enc-priv`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      logger.error(
        {
          path: "/crypto/wrapped-enc-priv",
          method: "GET",
          status: response.status,
          body: txt,
        },
        "[demo-api] request failed"
      );
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.wrapped_enc_private_jwk as string;
  }

  async getNoteAccessList(noteId: string): Promise<
    Array<{
      recipient_sub: string;
      grants: string;
      created_at: string;
    }>
  > {
    const Resp = z.object({
      access: z.array(
        z.object({
          recipient_sub: z.string(),
          grants: z.string(),
          created_at: z.string(),
        })
      ),
    });
    const response = await this.request<unknown>(`/demo/notes/${noteId}/access`);
    return Resp.parse(response).access;
  }

  // Collections endpoints
  async listCollections(): Promise<
    Array<{
      collection_id: string;
      name_ciphertext: string;
      icon?: string;
      color?: string;
    }>
  > {
    const Resp = z.object({
      collections: z.array(
        z.object({
          collection_id: z.string(),
          name_ciphertext: z.string(),
          icon: z.string().optional(),
          color: z.string().optional(),
        })
      ),
    });
    const response = await this.request<unknown>("/demo/collections");
    return Resp.parse(response).collections;
  }

  async createCollection(nameCiphertext: string, icon?: string, color?: string): Promise<string> {
    const Resp = z.object({ collection_id: z.string() });
    const response = await this.request<unknown>("/demo/collections", {
      method: "POST",
      body: JSON.stringify({
        name_ciphertext: nameCiphertext,
        icon,
        color,
      }),
    });
    return Resp.parse(response).collection_id;
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const Resp = z.object({ success: z.boolean() }).catch(() => ({ success: true }));
    const response = await this.request<unknown>(`/demo/collections/${collectionId}`, {
      method: "DELETE",
    });
    void Resp.parse(response);
  }
}

export const api = new ApiClient();
