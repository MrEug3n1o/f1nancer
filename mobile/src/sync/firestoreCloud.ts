import { collection, doc, getDocsFromServer, runTransaction } from 'firebase/firestore';
import type {
  FinanceRow, FinanceTable, FirestoreApplyResult, FirestoreCloudAdapter,
  FirestoreUpload,
} from '@f1nancer/domain';
import { firestore } from './firebaseClient';

function sameRow(left: FinanceRow, right: FinanceRow): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.every(key => left[key] === right[key]);
}

export class FirebaseCloudAdapter implements FirestoreCloudAdapter {
  private readonly userId: string;
  constructor(userId: string) { this.userId = userId; }

  async readAll(table: FinanceTable): Promise<FinanceRow[]> {
    const snapshot = await getDocsFromServer(collection(firestore, 'users', this.userId, table));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as FinanceRow);
  }

  async apply(operations: FirestoreUpload[]): Promise<FirestoreApplyResult[]> {
    const results: FirestoreApplyResult[] = [];
    for (const operation of operations) {
      const ref = doc(firestore, 'users', this.userId, operation.table, operation.id);
      const result = await runTransaction(firestore, async transaction => {
        const snapshot = await transaction.get(ref);
        const remote = snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as FinanceRow) : null;
        if (operation.kind === 'delete') {
          if (remote && (!operation.previousUpdatedAt || String(remote.updated_at) > operation.previousUpdatedAt)) {
            return { opId: operation.opId, conflict: true, remote };
          }
          transaction.delete(ref);
          return { opId: operation.opId };
        }
        const local = operation.row!;
        const remoteIsNewer = remote && String(remote.updated_at) > String(local.updated_at);
        const keepRemote = remote && operation.keepExisting && !sameRow(remote, local);
        if (remoteIsNewer || keepRemote) {
          return { opId: operation.opId, conflict: true, remote };
        }
        transaction.set(ref, local);
        return { opId: operation.opId };
      });
      results.push(result);
    }
    return results;
  }
}
