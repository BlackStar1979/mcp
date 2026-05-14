import { registerWebHttpTools } from "./web/http_tools.js";
import { registerWebPackageTools } from "./web/package_tools.js";
import { registerWebGithubTools } from "./web/github_tools.js";

export function registerWebTools(server) {
  registerWebHttpTools(server);
  registerWebPackageTools(server);
  registerWebGithubTools(server);
}
