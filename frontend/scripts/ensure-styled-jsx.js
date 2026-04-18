const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(frontendRoot, "..");
const sourceDir = path.join(workspaceRoot, "node_modules", "styled-jsx");
const targetDir = path.join(frontendRoot, "node_modules", "styled-jsx");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`styled-jsx source package not found at ${sourceDir}`);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
