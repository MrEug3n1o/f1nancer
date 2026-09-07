const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const opSqliteStub = path.resolve(projectRoot, "stubs/op-sqlite");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "frontend/node_modules"),
];
config.resolver.extraNodeModules = {
  "@f1nancer/domain": path.resolve(workspaceRoot, "packages/domain/src"),
  "@op-engineering/op-sqlite": opSqliteStub,
};
config.resolver.unstable_enableSymlinks = true;

const previousGetTransformOptions = config.transformer?.getTransformOptions;
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => {
    const previous = previousGetTransformOptions
      ? await previousGetTransformOptions()
      : {};
    let powerSyncBlock = {};
    try {
      powerSyncBlock = {
        [require.resolve("@powersync/react-native")]: true,
      };
    } catch {
      /* package optional during some installs */
    }
    return {
      ...previous,
      transform: {
        ...(previous.transform || {}),
        inlineRequires: {
          ...((previous.transform && previous.transform.inlineRequires) || {}),
          blockList: {
            ...((previous.transform &&
              previous.transform.inlineRequires &&
              previous.transform.inlineRequires.blockList) ||
              {}),
            ...powerSyncBlock,
          },
        },
      },
    };
  },
};

module.exports = config;
