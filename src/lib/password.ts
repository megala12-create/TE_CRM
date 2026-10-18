import { z } from "zod";

/** Login password rule, shared by the staff screen and "Change password". */
export const PASSWORD_MIN = 5;

export const passwordRule = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(200, "Use at most 200 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letters and numbers");

export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters with letters and numbers.`;
