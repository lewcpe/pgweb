import { DatabaseDetails, PgUser, PgUserWithPassword, BackupJob } from "@/types/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

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

  async post<T>(endpoint: string, body: unknown): Promise<T> {
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
  return api.get('/databases');
};

export const getDatabaseDetails = (databaseId: string): Promise<DatabaseDetails> => {
  return api.get(`/databases/${databaseId}`);
};

export const createDatabase = (name: string): Promise<DatabaseDetails> => {
  return api.post('/databases', { name });
};

export const getPgUsers = (databaseId: string): Promise<PgUser[]> => {
  return api.get(`/databases/${databaseId}/pgusers`);
};

export const createPgUser = (databaseId: string, username: string, permission: 'read' | 'write'): Promise<PgUserWithPassword> => {
  return api.post(`/databases/${databaseId}/pgusers`, { username, permission });
};

export const regeneratePgUserPassword = (databaseId: string, pgUserId: string): Promise<{ new_password: string }> => {
  return api.post(`/databases/${databaseId}/pgusers/${pgUserId}/regenerate-password`, {});
};

export const deletePgUser = (databaseId: string, pgUserId: string): Promise<void> => {
  return api.delete(`/databases/${databaseId}/pgusers/${pgUserId}`);
};

export const deleteDatabase = (databaseId: string): Promise<void> => {
  return api.delete(`/databases/${databaseId}`);
};

export const initiateBackup = (databaseId: string): Promise<BackupJob> => {
  return api.post(`/databases/${databaseId}/backup`, {});
};

export const getBackupStatus = (databaseId: string, jobId: string): Promise<BackupJob> => {
  return api.get(`/databases/${databaseId}/backup/${jobId}`);
};

export const downloadBackup = async (databaseId: string, jobId: string, databaseName: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/databases/${databaseId}/backup/${jobId}/download`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${databaseName}.dump`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const restoreDatabase = async (databaseId: string, file: File): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/databases/${databaseId}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `HTTP error! status: ${response.status}`);
  }
};