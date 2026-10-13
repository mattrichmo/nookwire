import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../dist/db/open.js';
import { Nookwire } from '../../dist/services/runtime.js';
import { OwnerService } from '../../dist/services/owner.js';
import { localOwnerContext } from '../../dist/auth/context.js';
import { driver } from './driver.mjs';
let repo;
try {
    repo = openDatabase(workerData.path, { driver, timeout: workerData.timeout ?? 500 });
    const service = new Nookwire(repo, { now: () => workerData.now }, { requests_per_key: 10000, requests_per_agent: 10000, writes_per_agent: 10000 });
    if (workerData.hold !== undefined) {
        repo.db.exec('BEGIN IMMEDIATE');
        parentPort.postMessage({ locked: true });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.hold);
        repo.db.exec('COMMIT');
    }
    else {
        if (workerData.barrier) {
            const b = new Int32Array(workerData.barrier);
            Atomics.add(b, 0, 1);
            Atomics.notify(b, 0);
            Atomics.wait(b, 1, 0);
        }
        const result = workerData.owner ? new OwnerService(service, localOwnerContext()).call(workerData.operation, workerData.input) : service.call(workerData.operation, workerData.input);
        parentPort.postMessage({ ok: true, result });
    }
}
catch (error) {
    parentPort.postMessage({ ok: false, error: { code: error.code ?? 'WORKER_FAILURE' } });
}
finally {
    repo?.db.close();
}
