import { RecordingSession, RecordingStatus } from '../types';

const DB_NAME = 'DictateFlowDB';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveRecordingToDB = async (session: RecordingSession): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(session);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export const getRecordingsFromDB = async (): Promise<RecordingSession[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result as RecordingSession[];
      // Sort by creation time descending
      resolve(results.sort((a, b) => b.createdAt - a.createdAt));
    };
  });
};

export const updateRecordingInDB = async (session: RecordingSession): Promise<void> => {
  return saveRecordingToDB(session); // Put overwrites if key exists
};

export const deleteOldRecordings = async (): Promise<void> => {
  const db = await initDB();
  const recordings = await getRecordingsFromDB();
  
  if (recordings.length <= 20) return;

  // Identify recordings to delete (everything after the 20th item)
  const toDelete = recordings.slice(20);

  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  for (const rec of toDelete) {
    store.delete(rec.id);
  }
  
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve();
  });
};

export const clearAllRecordings = async (): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
