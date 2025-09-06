import { refreshSession } from "@DarkAuth/client";

const runtimeCfg = (window as any).__APP_CONFIG__ || {};
const demoApi = runtimeCfg.demoApi || "http://localhost:9094";
const darkauthApi = (runtimeCfg.issuer || "http://localhost:9080") + "/api";

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
  aad: any;
}

export interface UserProfile {
  sub: string;
  display_name?: string;
  avatar_url?: string;
  public_key_jwk: JsonWebKey;
  wrapped_private_key?: string;
}

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const idToken = sessionStorage.getItem("id_token");
    if (!idToken) throw new Error("No authentication token");
    
    const headers = {
      ...options.headers,
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    };
    
    let response = await fetch(`${demoApi}${path}`, {
      ...options,
      headers,
    });
    
    if (response.status === 401) {
      // Try to refresh token
      const newSession = await refreshSession();
      if (newSession) {
        headers["Authorization"] = `Bearer ${newSession.idToken}`;
        response = await fetch(`${demoApi}${path}`, {
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
        console.error("[demo-api] request failed", { path, method: options.method || "GET", status: response.status, body: parsed || errText || null });
        throw new Error(msg);
      } catch {
        console.error("[demo-api] request failed", { path, method: options.method || "GET", status: response.status, body: errText || null });
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
    return this.request("/demo/users/me", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
  }
  
  async searchUsers(query: string): Promise<UserProfile[]> {
    const url = `${darkauthApi}/users/search?q=${encodeURIComponent(query)}`;
    const idToken = sessionStorage.getItem("id_token");
    const resp = await fetch(url, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return (data.users || []).map((u: any) => ({
      sub: u.sub,
      display_name: u.display_name || u.name,
      avatar_url: u.avatar_url || undefined,
      public_key_jwk: u.public_key_jwk,
    }));
  }
  
  // Notes endpoints
  async listNotes(): Promise<Note[]> {
    const response = await this.request<{ notes: Note[] }>("/demo/notes");
    return response.notes;
  }
  
  async createNote(collectionId?: string): Promise<string> {
    const response = await this.request<{ note_id: string }>("/demo/notes", {
      method: "POST",
      body: JSON.stringify({ collection_id: collectionId }),
    });
    return response.note_id;
  }
  
  async deleteNote(noteId: string): Promise<void> {
    await this.request(`/demo/notes/${noteId}`, {
      method: "DELETE",
    });
  }
  
  async getNoteChanges(noteId: string, since = 0): Promise<NoteChange[]> {
    const response = await this.request<{ changes: NoteChange[] }>(
      `/demo/notes/${noteId}/changes?since=${since}`
    );
    return response.changes;
  }
  
  async appendNoteChange(
    noteId: string,
    ciphertextBase64: string,
    aad: any
  ): Promise<void> {
    await this.request(`/demo/notes/${noteId}/changes`, {
      method: "POST",
      body: JSON.stringify({
        ciphertext_b64: ciphertextBase64,
        aad,
      }),
    });
  }
  
  async updateNoteMetadata(
    noteId: string,
    metadata: { title_ciphertext?: string; tags_ciphertext?: string }
  ): Promise<void> {
    await this.request(`/demo/notes/${noteId}/metadata`, {
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
    await this.request(`/demo/notes/${noteId}/share`, {
      method: "POST",
      body: JSON.stringify({
        recipient_sub: recipientSub,
        dek_jwe: dekJwe,
        grants,
      }),
    });
  }
  
  async revokeNoteAccess(noteId: string, recipientSub: string): Promise<void> {
    await this.request(`/demo/notes/${noteId}/share/${encodeURIComponent(recipientSub)}`, {
      method: "DELETE",
    });
  }
  
  async getNoteDek(noteId: string): Promise<string> {
    const response = await this.request<{ dek_jwe: string }>(
      `/demo/notes/${noteId}/dek`
    );
    return response.dek_jwe;
  }

  async getWrappedEncPrivateJwk(): Promise<string> {
    const idToken = sessionStorage.getItem("id_token");
    if (!idToken) throw new Error("No authentication token");
    const url = `${darkauthApi}/crypto/wrapped-enc-priv`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error("[demo-api] request failed", { path: "/crypto/wrapped-enc-priv", method: "GET", status: resp.status, body: txt });
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data.wrapped_enc_private_jwk as string;
  }
  
  async getNoteAccessList(noteId: string): Promise<Array<{
    recipient_sub: string;
    grants: string;
    created_at: string;
  }>> {
    const response = await this.request<{ access: Array<any> }>(
      `/demo/notes/${noteId}/access`
    );
    return response.access;
  }
  
  // Collections endpoints
  async listCollections(): Promise<Array<{
    collection_id: string;
    name_ciphertext: string;
    icon?: string;
    color?: string;
  }>> {
    const response = await this.request<{ collections: Array<any> }>("/demo/collections");
    return response.collections;
  }
  
  async createCollection(nameCiphertext: string, icon?: string, color?: string): Promise<string> {
    const response = await this.request<{ collection_id: string }>("/demo/collections", {
      method: "POST",
      body: JSON.stringify({
        name_ciphertext: nameCiphertext,
        icon,
        color,
      }),
    });
    return response.collection_id;
  }
  
  async deleteCollection(collectionId: string): Promise<void> {
    await this.request(`/demo/collections/${collectionId}`, {
      method: "DELETE",
    });
  }
}

export const api = new ApiClient();
