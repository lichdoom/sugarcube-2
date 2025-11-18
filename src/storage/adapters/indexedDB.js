/* global Serial, SimpleStore */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let _ok = false;

	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		constructor(storageId, persistent) {
			const name = `${storageId}${persistent ? 'Saves' : 'State'}`;
			const cache = new Map();
			
			this._db = null;

			// Open IndexedDB
			this.ready = this._openDatabase(name)
				.then(() => this._loadCache(cache))
				.catch(err => console.error('Error initializing IndexedDBAdapter:', err));

			Object.defineProperties(this, {
				_db : {
					configurable: false,
					enumerable: false,
				},
				_cache : {
					value : cache
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
				const request = indexedDB.open(name, 1);
				
				request.onupgradeneeded = e => {
					e.target.result.createObjectStore('sugarcube', { keyPath: 'id' });
				};
				request.onerror = e => {
					reject(`IndexedDB open error: ${e.target.error}`);
				};
				request.onsuccess = e => {
					this._db = e.target.result;
					resolve();
				};
			});
		}

		// Load data from the database into cache
		_loadCache(cache) {
			return new Promise((resolve, reject) => {
				const transaction = this._db.transaction('sugarcube', 'readonly');
				const store = transaction.objectStore('sugarcube');
				const request = store.getAll();

				request.onsuccess = () => {
					const rows = request.result;
					for (const row of rows) {
						cache.set(row.id, row.data);
					}
					resolve();
				};
				request.onerror = e => {
					reject(`IndexedDB read error: ${e.target.error}`);
				};
			});
		}

		// Public methods
		get size() {
			return this._cache.size;
		}

		keys() {
			return [...this._cache.keys()];
		}

		has(key) {
			if (typeof key !== 'string' || !key) {
				return false;
			}
			return this._cache.has(key);
		}

		get(key) {
			if (typeof key !== 'string' || !key) {
				return null;
			}
			const value = this._cache.get(key);
			return value !== undefined ? Serial.parse(value) : null;
		}

		set(key, value) {
			if (typeof key !== 'string' || !key) {
				return false;
			}
			const str = Serial.stringify(value);
			this._cache.set(key, str);

			// Store in IndexedDB
			const transaction = this._db.transaction('sugarcube', 'readwrite');
			const store = transaction.objectStore('sugarcube');
			const request = store.put({ id: key, data: str });

			request.onerror = e => {
				console.error('IndexedDB write error:', e.target.error);
			};

			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) {
				return false;
			}
			this._cache.delete(key);

			// Delete from IndexedDB
			const transaction = this._db.transaction('sugarcube', 'readwrite');
			const store = transaction.objectStore('sugarcube');
			const request = store.delete(key);

			request.onerror = e => {
				console.error('IndexedDB delete error:', e.target.error);
			};

			return true;
		}

		clear() {
			this._cache.clear();

			// Clear all data from IndexedDB
			const transaction = this._db.transaction('sugarcube', 'readwrite');
			const store = transaction.objectStore('sugarcube');
			const request = store.clear();

			request.onerror = e => {
				console.error('IndexedDB clear error:', e.target.error);
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
		init: { value: init },
		create: { value: create }
	}));
})());
