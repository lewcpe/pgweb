import { writable } from 'svelte/store';

export interface User {
  id: string;
  username: string;
  email?: string; // Optional, depending on what the backend provides
  // Add other user-related fields as necessary
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  error: string | null;
}

const initialAuthState: AuthState = {
  isAuthenticated: false,
  user: null,
  error: null,
};

export const authStore = writable<AuthState>(initialAuthState);

export function setAuthenticated(user: User) {
  authStore.set({ isAuthenticated: true, user, error: null });
}

export function setUnauthenticated(error?: string) {
  authStore.set({ isAuthenticated: false, user: null, error: error || null });
}

// Function to check if a user session exists (e.g., by calling a /api/me endpoint)
// This will be more fleshed out in a later step.
export async function checkSession() {
  // Placeholder: In a real app, you would make an API call here.
  // For now, we assume the user is not authenticated on initial load
  // unless a subsequent action (like OIDC callback) authenticates them.
  // A more complete implementation will be done in step 5.
  // setUnauthenticated(); // Initial state is already unauthenticated
}
