/* global Serial, SimpleStore */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let ok = false;

	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		// Private fields.
		#db;    // IndexedDb instance
		#cache; // DB cache

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

		// Private methods
		async #init(name) {
			try {
				await this.#openDB(name);
				await this.#loadCache();
			}
			catch (ex) {
				console.log(ex);
			}
		}

		// Open IndexedDB database
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

		// Load data from the database into cache
		#loadCache() {
			return new Promise((resolve, reject) => {
				const store = this.#tx('readonly');
				const req = store.getAll();

				req.onerror = () => {
					reject(req.error);
				};
				req.onsuccess = () => {
					for (const row of req.result) {
						this.#cache.set(row.id, row.data);
					}
					resolve();
				};
			});
		}

		#tx(mode = 'readwrite') {
			return this.#db.transaction('sugarcube', mode).objectStore('sugarcube');
		}

		// Public methods
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

			const data = this.#cache.get(key);
			return data === undefined ? null : Serial.parse(data);
		}

		set(key, data) {
			if (typeof key !== 'string' || !key) {
				return false;
			}

			const str = Serial.stringify(data);
			this.#cache.set(key, str);

			// Store in IndexedDB
			const store = this.#tx();
			const req = store.put({ id : key, data : str });

			req.onerror = () => {
				console.log(req.error);
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
				console.log(req.error);
			};

			return true;
		}

		clear() {
			this.#cache.clear();

			// Clear all records from IndexedDB
			const store = this.#tx();
			const req = store.clear();

			req.onerror = () => {
				console.log(req.error);
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
