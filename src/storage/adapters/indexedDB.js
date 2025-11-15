/* global Serial, SimpleStore, Dexie */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let _ok = false;


	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		constructor(storageId, persistent) {
			const prefix = `${storageId}${persistent ? 'Saves' : 'State'}`;
			const cache = new Map();

			const db = new Dexie(prefix);
			db.version(1).stores({ sugarcube : 'id' });

			// Populate cache on initialization
			this.ready = db.open()
				.then(() => db.sugarcube.toArray())
				.then(rows => {
					for (const row of rows) {
						cache.set(row.id, row.data);
					}
				})
				.catch(err => console.error('Error initializing IndexedDBAdapter:', err));

			Object.defineProperties(this, {
				_engine : {
					value : db.sugarcube
				},
				_cache : {
					value : cache
				},
				_prefix : {
					value : prefix
				},
				_prefixRe : {
					value : new RegExp(`^${RegExp.escape(prefix)}`)
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


		// Public methods.
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
			this._engine.put({ id : key, data : str });

			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) {
				return false;
			}
			this._cache.delete(key);
			this._engine.delete(key);
			return true;
		}

		clear() {
			this._cache.clear();
			this._engine.clear();
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
		_ok = 'indexedDB' in window && Dexie;

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
