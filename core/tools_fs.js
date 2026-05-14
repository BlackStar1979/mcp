import { registerFsReadTools } from "./filesystem/read_tools.js";
import { registerFsMutationTools } from "./filesystem/mutation_tools.js";
import { registerFsPatchTools } from "./filesystem/patch_tools.js";

// Package facade: filesystem tool family entrypoint for server bootstrap.
export function registerFsTools(server) {
  registerFsReadTools(server);
  registerFsMutationTools(server);
  registerFsPatchTools(server);
}
