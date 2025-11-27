/* global Serial, SimpleStore */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let ok = false;


	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		// Private fields.
		#db;   // Our database engine.
		#cache;// DB cache

		// Public fields.
		name;       // Our name.
		id;         // Our storage ID.
		persistent; // Are we a persistent store?


		constructor(storageId, persistent) {
			Object.defineProperties(this, {
				ready : {
					value : this.#init(`${storageId}_${persistent ? 'Saves' : 'State'}`)
				},
				name : {
					value : 'IndexedDB'
				},

				id : {
					value : storageId
				},
				persistent : {
					value : Boolean(persistent)
				}
			});
		}

		// Private methods.

		async #init(name) {
			try {
				await this.#openDB(name);
				await this.#loadCache();
			}
			catch (ex) {
				throw ex;
			}
		}

		#openDB(name) {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(name, 1);

				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains('sugarcube')) {
						db.createObjectStore('sugarcube', { keyPath : 'id' });
					}
				};
				req.onerror = () => {
					reject(req.error);
				};
				req.onsuccess = () => {
					this.#cache = new Map();
					this.#db = req.result;
					resolve();
				};
			});
		}

		#loadCache() {
			return new Promise((resolve, reject) => {
				const store = this.#tx('readonly');
				const req = store.getAll();

				req.onerror = () => {
					reject(req.error);
				};
				req.onsuccess = () => {
					for (const row of req.result) {
						this.#cache.set(row.id, row.value);
					}
					resolve();
				};
			});
		}

		#tx(mode = 'readwrite') {
			return this.#db.transaction('sugarcube', mode).objectStore('sugarcube');
		}


		// Public methods.

		get size() {
			return this.#cache.size;
		}

		keys() {
			return [...this.#cache.keys()];
		}

		has(key) {
			return typeof key === 'string' && this.#cache.has(key);
		}

		get(key) {
			if (typeof key !== 'string' || !key) {
				return null;
			}

			const value = this.#cache.get(key);
			return value === undefined ? null : Serial.parse(value);
		}

		set(key, value) {
			if (typeof key !== 'string' || !key) {
				return false;
			}

			const str = Serial.stringify(value);
			this.#cache.set(key, str);

			// Store in IndexedDB
			const store = this.#tx();
			const req = store.put({ id : key, data : str });

			req.onerror = () => {
				throw req.error;
			};

			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) {
				return false;
			}

			this.#cache.delete(key);

			// Delete key from IndexedDB
			const store = this.#tx();
			const req = store.delete(key);

			req.onerror = () => {
				throw req.error;
			};

			return true;
		}

		clear() {
			this.#cache.clear();

			// Clear all records from IndexedDB
			const store = this.#tx();
			const req = store.clear();

			req.onerror = () => {
				throw req.error;
			};

			return true;
		}
	}


	/*******************************************************************************
		Adapter Utility Functions.
	*******************************************************************************/

	function create(storageId, persistent) {
		if (!ok) {
			throw new Error('adapter not initialized');
		}

		return new IndexedDBAdapter(storageId, persistent);
	}

	function init() {
		// IndexedDB feature test.
		ok = 'indexedDB' in window;

		return ok;
	}


	/*******************************************************************************
		Object Exports.
	*******************************************************************************/

	return Object.preventExtensions(Object.create(null, {
		init   : { value : init },
		create : { value : create }
	}));
})());
