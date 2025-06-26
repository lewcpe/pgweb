import { DatabaseDetails, PgUser, PgUserWithPassword } from "@/types/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

const api = {
  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async post<T>(endpoint: string, body: any): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async delete(endpoint: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  },
};

export const getDatabases = (): Promise<DatabaseDetails[]> => {
  return api.get(`/databases`);
};

export const getDatabaseDetails = (databaseId: string): Promise<DatabaseDetails> => {
  return api.get(`/databases/${databaseId}`);
};

export const createDatabase = (name: string): Promise<DatabaseDetails> => {
  return api.post(`/databases`, { name });
};

export const getPgUsers = (databaseId: string): Promise<PgUser[]> => {
  return api.get(`/databases/${databaseId}/pgusers`);
};

export const createPgUser = (
  databaseId: string,
  username: string,
  permission: "read" | "write"
): Promise<PgUserWithPassword> => {
  return api.post<PgUserWithPassword>(`/databases/${databaseId}/pgusers`, { username, permission_level: permission })
}

export const regeneratePgUserPassword = (databaseId: string, pgUserId: string): Promise<{ new_password: string }> => {
  return api.post(`/databases/${databaseId}/pgusers/${pgUserId}/regenerate-password`, {});
};

export const deletePgUser = (databaseId: string, pgUserId: string): Promise<void> => {
  return api.delete(`/databases/${databaseId}/pgusers/${pgUserId}`);
};

export const deleteDatabase = (databaseId: string): Promise<void> => {
  return api.delete(`/databases/${databaseId}`);
};