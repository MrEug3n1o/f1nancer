import {
  AUTH_EMAIL_DOMAIN,
  RESERVED_USERNAMES,
  USERNAME_PATTERN,
} from "./constants";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export function validateUsername(raw: string): string {
  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Username must be 3–32 characters: lowercase letters, numbers, or underscore",
    );
  }
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error("That username is reserved");
  }
  return username;
}

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}
