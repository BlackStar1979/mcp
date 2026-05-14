import { registerCodeSymbolsTools } from "./code/symbols_tools.js";
import { registerCodeAnalysisTools } from "./code/analysis_tools.js";

export function registerCodeTools(server) {
  registerCodeSymbolsTools(server);
  registerCodeAnalysisTools(server);
}

