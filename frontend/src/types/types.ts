export interface DatabaseDetails {
  database_id: string;
  owner_user_id: string;
  owner_email: string;
  pg_database_name: string;
  status: "active" | "pending_creation" | "error";
  created_at: string;
  updated_at: string;
}

export interface PgUser {
  pg_user_id: string;
  pg_username: string;
  permission_level: "read" | "write";
  status: "active" | "pending";
  created_at: string;
  password?: string;
}

export interface PgUserWithPassword extends PgUser {
  password: string;
}

export interface BackupJob {
  backup_job_id: string;
  database_id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  file_size: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}