/* global Serial, SimpleStore */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let _ok = false;

	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		constructor(storageId, persistent) {
			const name = `${storageId}_${persistent ? 'Saves' : 'State'}`;
			const cache = new Map();

			Object.defineProperties(this, {
				_cache : {
					value : cache
				},
				ready : {
					value : this._openDatabase(name)
						.then(() => this._loadCache(cache))
						.catch(err => console.error('Error initializing IndexedDBAdapter:', err))
				},
				name: {
					value: 'IndexedDB'
				},
				id: {
					value: storageId
				},
				persistent: {
					value: Boolean(persistent)
				}
			});
		}

		// Open IndexedDB database
		_openDatabase(name) {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(name, 1);

				req.onupgradeneeded = e => {
					try {
						const db = req.result;
						if (!db.objectStoreNames.contains('sugarcube')) {
							db.createObjectStore('sugarcube', { keyPath: 'id' });
						}
					} catch (err) {
						reject(`Error during DB upgrade: ${err}`);
					}
				};
				req.onerror = e => {
					reject(`IndexedDB open error: ${req.error}`);
				};
				req.onsuccess = e => {
					Object.defineProperties(this, {
						_db : { value : req.result }
					})
					resolve();
				};
			});
		}

		// Load data from the database into cache
		_loadCache(cache) {
			return new Promise((resolve, reject) => {
				const store = this._tx('readonly');
				const req = store.getAll();

				req.onsuccess = e => {
					for (const row of req.result) {
						cache.set(row.id, row.data);
					}
					resolve();
				};
				req.onerror = e => {
					reject(`IndexedDB read error: ${req.error}`);
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
			const value = this._cache.get(key);
			return value === undefined ? null : Serial.parse(value);
		}

		set(key, value) {
			if (typeof key !== 'string' || !key) {
				return false;
			}
			const str = Serial.stringify(value);
			this._cache.set(key, str);

			// Store in IndexedDB
			const store = this._tx();
			const req = store.put({ id: key, data: str });

			req.onerror = e => {
				console.error('IndexedDB write error:', req.error);
			};

			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) {
				return false;
			}
			this._cache.delete(key);

			// Delete key from IndexedDB
			const store = this._tx();
			const req = store.delete(key);

			req.onerror = e => {
				console.error('IndexedDB delete error:', req.error);
			};

			return true;
		}

		clear() {
			this._cache.clear();

			// Clear all records from IndexedDB
			const store = this._tx();
			const req = store.clear();

			req.onerror = e => {
				console.error('IndexedDB clear error:', req.error);
			};

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
