/** Metro stub: sql.js's Node path is unused on React Native. */
module.exports = {
  existsSync() {
    return false;
  },
  readFileSync() {
    throw new Error("node:fs is not available in React Native");
  },
};
