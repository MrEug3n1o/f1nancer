/**
 * Metro resolves @op-engineering/op-sqlite here so importing
 * @powersync/react-native never runs native JSI install().
 */
function disabled() {
  throw new Error("Native op-sqlite is disabled; F1nancer uses sql.js");
}

module.exports = {
  open: disabled,
  openSync: disabled,
  getDylibPath: disabled,
  OPSQLite: {
    install() {
      return true;
    },
    getConstants() {
      return {};
    },
  },
};
