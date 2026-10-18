// Lets command-line scripts load src/server modules: "server-only" guards the client bundle, not Node.
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { return s === "server-only" ? { url: "data:text/javascript,", shortCircuit: true } : next(s, c); }`),
);
