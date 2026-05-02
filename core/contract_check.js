// extended: supports custom dir + outputSchema validation
import fs from "fs/promises";
import path from "path";

const TARGET = process.argv[2] || path.resolve("C:\\Work\\mcp");

const failures = [];
function fail(m){failures.push(m)}

async function main(){
  const fsSource = await fs.readFile(path.join(TARGET, "tools_fs.js"), "utf8");

  for (const name of ["read_file","read_file_lines","read_file_chunk"]){
    const idx = fsSource.indexOf(name);
    const block = fsSource.slice(idx, idx+2000);

    if (!block.includes("outputSchema")) fail(`${name}: missing outputSchema`);
    if (!block.includes("text:")) fail(`${name}: missing structuredContent.text`);
  }

  if(failures.length){
    console.error("FAIL");
    failures.forEach(f=>console.error("- "+f));
    process.exit(1);
  }

  console.log("OK (outputSchema + IO contract)");
}

main();
