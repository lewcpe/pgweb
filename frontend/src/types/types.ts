export interface DatabaseDetails {
  id: string;
  name: string;
  status: "active" | "pending_creation" | "error";
  createdAt: string;
  owner: string;
  description?: string;
}

export interface PgUser {
  id: string;
  username: string;
  permission: "read" | "write";
  status: "active" | "pending";
  createdAt: string;
}