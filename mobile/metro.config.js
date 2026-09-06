const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "frontend/node_modules"),
];
config.resolver.extraNodeModules = {
  "@f1nancer/domain": path.resolve(workspaceRoot, "packages/domain/src"),
};
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
