/**
 * Decision logic for the "Customize" section of the person card (set / change / remove the
 * GIF over someone's head). Pure: no DOM, storage passed in, so it is unit tested.
 */
import { ApiError, parseGiphyId } from "@agent-office/protocol";

// ---- link input -----------------------------------------------------------------------------

export type GifInputCheck =
  | { state: "empty" }
  | { state: "invalid"; hint: string }
  | { state: "same"; id: string; hint: string }
  | { state: "valid"; id: string };

export const HINT_INVALID = "That's not a Giphy GIF link";
export const HINT_SAME = "Already the current GIF";

/** What the pasted text means: nothing yet, not a Giphy GIF, the GIF already set, or a new one. */
export function validateGifInput(
  input: string,
  currentGif: string | null | undefined,
): GifInputCheck {
  if (!input.trim()) return { state: "empty" };
  const id = parseGiphyId(input);
  if (!id) return { state: "invalid", hint: HINT_INVALID };
  if (id === currentGif) return { state: "same", id, hint: HINT_SAME };
  return { state: "valid", id };
}

// ---- PUT /api/people/:personId/gif result -------------------------------------------------------

/** What the injected `putGif` callback reports: the HTTP status (0 = no response) and JSON body. */
export type PutGifResult = { status: number; body: unknown };

export type SaveOutcome =
  /** 200: the server broadcasts `gif.updated`; the card follows the model, not this response */
  | { kind: "saved" }
  /** 401: forget the stored password and ask for it again */
  | { kind: "needPassword"; message: string }
  | { kind: "error"; message: string };

export const MSG_WRONG_PASSWORD = "Wrong password";
export const MSG_NOT_FOUND = "Not in the office right now";
export const MSG_NETWORK = "Couldn't reach the office. Check your connection and try again.";

const serverError = (body: unknown): string | null => {
  const e = ApiError.safeParse(body);
  return e.success && e.data.error.trim() ? e.data.error.trim().slice(0, 200) : null;
};

/** Map a save attempt's HTTP status + body to what the card shows. */
export function saveOutcome({ status, body }: PutGifResult): SaveOutcome {
  if (status >= 200 && status < 300) return { kind: "saved" };
  if (status === 401) return { kind: "needPassword", message: MSG_WRONG_PASSWORD };
  if (status === 404) return { kind: "error", message: MSG_NOT_FOUND };
  if (status === 0) return { kind: "error", message: MSG_NETWORK };
  if (status === 400) return { kind: "error", message: serverError(body) ?? "That didn't work" };
  return {
    kind: "error",
    message: serverError(body) ?? `Something went wrong (HTTP ${status}). Try again.`,
  };
}

// ---- remembered office password ---------------------------------------------------------------

export const PASSWORD_KEY = "agent-office.password";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Stored password, or null (no storage, nothing stored, storage throws). */
export function getPassword(storage: StorageLike | null | undefined): string | null {
  try {
    const v = storage?.getItem(PASSWORD_KEY);
    return v ? v : null;
  } catch {
    return null;
  }
}

/** Remember the password; false when storage is missing or refuses (private mode, quota). */
export function setPassword(storage: StorageLike | null | undefined, password: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PASSWORD_KEY, password);
    return true;
  } catch {
    return false;
  }
}

export function clearPassword(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(PASSWORD_KEY);
  } catch {
    // nothing to do
  }
}

/**
 * The password for this browser: localStorage when it works, else kept in memory for this page
 * so a viewer without storage only types it once per visit. `storage` is a getter because even
 * touching `window.localStorage` can throw (sandboxed iframes, blocked site data).
 */
export class PasswordStore {
  private mem: string | null = null;
  constructor(private readonly storage: () => StorageLike | null | undefined) {}

  private safeStorage(): StorageLike | null {
    try {
      return this.storage() ?? null;
    } catch {
      return null;
    }
  }

  get(): string | null {
    return getPassword(this.safeStorage()) ?? this.mem;
  }

  set(password: string) {
    this.mem = password;
    setPassword(this.safeStorage(), password);
  }

  clear() {
    this.mem = null;
    clearPassword(this.safeStorage());
  }
}
