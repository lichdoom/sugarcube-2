/* global Serial, SimpleStore */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let _ok = false;

	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		constructor(storageId, persistent) {
			this.ready = this._init(`${storageId}_${persistent ? 'Saves' : 'State'}`);

			Object.defineProperties(this, {
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

		async _init(name) {
			try {
				await this._openDB(name);
				await this._loadCache();
			}
			catch (ex) {
				console.log(ex);
				throw ex;
			}
		}

		// Open IndexedDB database
		_openDB(name) {
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
					Object.defineProperties(this, {
						_cache : {
							value : new Map()
						},
						_db : {
							value : req.result
						}
					});
					resolve();
				};
			});
		}

		// Load data from the database into cache
		_loadCache() {
			return new Promise((resolve, reject) => {
				const store = this._tx('readonly');
				const req = store.getAll();

				req.onerror = () => {
					reject(req.error);
				};
				req.onsuccess = () => {
					for (const row of req.result) {
						this._cache.set(row.id, row.data);
					}
					resolve();
				};
			});
		}

		_tx(mode = 'readwrite') {
			return this._db.transaction('sugarcube', mode).objectStore('sugarcube');
		}

		// Public methods
		get size() {
			return this._cache.size;
		}

		keys() {
			return [...this._cache.keys()];
		}

		has(key) {
			return typeof key === 'string' && this._cache.has(key);
		}

		get(key) {
			if (typeof key !== 'string' || !key) {
				return null;
			}

			const data = this._cache.get(key);
			return data === undefined ? null : Serial.parse(data);
		}

		set(key, data) {
			if (typeof key !== 'string' || !key) {
				return false;
			}

			const str = Serial.stringify(data);
			this._cache.set(key, str);

			// Store in IndexedDB
			this.ready = this.ready.then(() => {
				return new Promise((resolve, reject) => {
					const store = this._tx();
					const req = store.put({ id : key, data : str });

					req.onerror = () => {
						console.log(req.error);
						reject(req.error);
					};
					req.onsuccess = () => {
						resolve();
					};
				});
			});

			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) {
				return false;
			}

			this._cache.delete(key);

			// Delete key from IndexedDB
			this.ready = this.ready.then(() => {
				return new Promise((resolve, reject) => {
					const store = this._tx();
					const req = store.delete(key);

					req.onerror = () => {
						console.log(req.error);
						reject(req.error);
					};
					req.onsuccess = () => {
						resolve();
					};
				});
			});

			return true;
		}

		clear() {
			this._cache.clear();

			// Clear all records from IndexedDB
			this.ready = this.ready.then(() => {
				return new Promise((resolve, reject) => {
					const store = this._tx();
					const req = store.clear();

					req.onerror = () => {
						console.log(req.error);
						reject(req.error);
					};
					req.onsuccess = () => {
						resolve();
					};
				});
			});

			return true;
		}
	}

	/*******************************************************************************
		Adapter Utility Functions.
	*******************************************************************************/

	function create(storageId, persistent) {
		if (!_ok) {
			throw new Error('adapter not initialized');
		}

		return new IndexedDBAdapter(storageId, persistent);
	}

	function init() {
		// IndexedDB feature test.
		_ok = 'indexedDB' in window;

		return _ok;
	}

	/*******************************************************************************
		Object Exports.
	*******************************************************************************/

	return Object.preventExtensions(Object.create(null, {
		init   : { value : init },
		create : { value : create }
	}));
})());
