/** Metro stub: sql.js uses Node crypto only when running in Node. */
module.exports = {
  randomFillSync(buffer) {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(buffer);
      return buffer;
    }
    throw new Error("node:crypto is not available in React Native");
  },
};
