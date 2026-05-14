import { registerRemoteSiteFileOpsTools } from "./remote_site/file_ops_tools.js";
import { registerRemoteSiteRuntimeTools } from "./remote_site/runtime_tools.js";
import {
  assertAllowedFileExtension,
  joinRemoteUnderRoot,
  normalizeRemoteRelativePath,
} from "./remote_site/shared_runtime.js";

export {
  normalizeRemoteRelativePath,
  assertAllowedFileExtension,
  joinRemoteUnderRoot,
};

export function registerRemoteSiteTools(server) {
  registerRemoteSiteFileOpsTools(server);
  registerRemoteSiteRuntimeTools(server);
}

