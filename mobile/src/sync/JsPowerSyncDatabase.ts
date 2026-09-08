import {
  SyncStreamConnectionMethod,
  type DBAdapter,
  type PowerSyncBackendConnector,
} from "@powersync/common";
import {
  BasePowerSyncDatabase,
  openDatabase,
  type CreateSyncImplementationOptions,
} from "@powersync/shared-internals";
import { ReactNativeBucketStorageAdapter } from "@powersync/react-native/lib/sync/bucket/ReactNativeBucketStorageAdapter";
import { defaultFetchImplementation } from "@powersync/react-native/lib/sync/stream/fetch";
import { ReactNativeRemote } from "@powersync/react-native/lib/sync/stream/ReactNativeRemote";
import { ReactNativeStreamingSyncImplementation } from "@powersync/react-native/lib/sync/stream/ReactNativeStreamingSyncImplementation";

/**
 * PowerSync client for Expo Go: uses a sql.js factory and never loads the
 * native op-sqlite adapter (JSI install is unavailable in Expo Go).
 */
export class JsPowerSyncDatabase extends BasePowerSyncDatabase {
  async _initialize(): Promise<void> {}

  protected override openDBAdapter(): DBAdapter {
    return openDatabase(this.options as never, () => {
      throw new Error("F1nancer Expo Go requires a sql.js factory; native SQLite is unavailable");
    });
  }

  protected override generateBucketStorageAdapter() {
    return new ReactNativeBucketStorageAdapter(this.database, this.logger);
  }

  protected override generateSyncStreamImplementation(
    connector: PowerSyncBackendConnector,
    options: CreateSyncImplementationOptions,
  ) {
    const remote = new ReactNativeRemote(
      connector,
      this.logger,
      (this.options as { remote?: object }).remote,
    );
    return new ReactNativeStreamingSyncImplementation({
      ...this.commonSyncOptions(connector, options),
      remote,
    });
  }

  protected override get defaultConnectionMethod(): SyncStreamConnectionMethod {
    const fetch =
      (this.options as { remote?: { fetchImplementation?: ReturnType<typeof defaultFetchImplementation> } })
        .remote?.fetchImplementation ?? defaultFetchImplementation(this.logger);
    return fetch.supportsStreams
      ? SyncStreamConnectionMethod.HTTP
      : SyncStreamConnectionMethod.WEB_SOCKET;
  }
}
