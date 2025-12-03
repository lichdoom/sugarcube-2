/* global Serial, SimpleStore */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let _ok = false;

	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		constructor(storageId, persistent) {
			this._db      = null;
			this._opening = null;
			this._cache   = new Map();
			this._name    = `${storageId}_${persistent ? 'Saves' : 'State'}`;

			Object.defineProperties(this, {
				ready      : { value : this._init(), writable : true },
				name       : { value : 'IndexedDB' },
				id         : { value : storageId },
				persistent : { value : Boolean(persistent) }
			});
		}

		/* -------------------------------------------------------------
		* Initialization
		* ----------------------------------------------------------- */
		async _init() {
			await this._openOrReuse();
			await this._loadCache();
		}

		// eslint-disable-next-line require-await
		async _openOrReuse() {
			if (this._db) return;
			if (this._opening) return this._opening;

			this._opening = this._openDB(this._name)
				.finally(() => { this._opening = null; });

			return this._opening;
		}

		_openDB(name) {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(name, 1);

				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains('sugarcube')) {
						db.createObjectStore('sugarcube', { keyPath : 'id' });
					}
				};
				req.onerror = () => reject(req.error);
				req.onblocked = () => {
					console.warn('[IndexedDBAdapter] Open request blocked — another tab must be closed.');
				};
				req.onsuccess = () => {
					const db = req.result;
					this._db = db;

					/* Auto-reopen if DB connection is killed */
					db.onclose = () => {
						console.warn('[IndexedDBAdapter] DB connection closed — attempting reopen.');
						this._db = null;
						this._openOrReuse().catch(err => console.error('Reopen failed:', err));
					};
					/* Multi-tab upgrade handling */
					db.onversionchange = () => {
						console.warn('[IndexedDBAdapter] Version change detected — closing DB.');
						db.close();
						this._db = null;
					};

					resolve();
				};
			});
		}

		/* -------------------------------------------------------------
		* Ensure DB connection
		* ----------------------------------------------------------- */
		async _ensureOpen() {
			if (this._db) return;
			await this._openOrReuse();
		}

		/* -------------------------------------------------------------
		* Load cache
		* ----------------------------------------------------------- */
		async _loadCache() {
			await this._ensureOpen();

			return new Promise((resolve, reject) => {
				const tx = this._db.transaction('sugarcube', 'readonly');
				const req = tx.objectStore('sugarcube').getAll();

				/* Important: catch transaction-level abort */
				tx.onabort = () => reject(tx.error);
				tx.onerror = () => reject(tx.error);

				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
					this._cache.clear();
					for (const row of req.result) {
						this._cache.set(row.id, row.data);
					}
					resolve();
				};
			});
		}

		/* -------------------------------------------------------------
		* Safe transaction (retry on close or inactive)
		* ----------------------------------------------------------- */
		async _safeTx(mode = 'readwrite') {
			await this._ensureOpen();

			try {
				return this._db.transaction('sugarcube', mode).objectStore('sugarcube');
			}
			catch (err) {
				if (err.name === 'InvalidStateError' || err.name === 'TransactionInactiveError') {
					this._db = null;
					await this._ensureOpen();
					return this._db.transaction('sugarcube', mode).objectStore('sugarcube');
				}
				throw err;
			}
		}

		/* -------------------------------------------------------------
		* Queue operations safely
		* ----------------------------------------------------------- */
		_enqueue(op) {
			this.ready = this.ready.then(async () => {
				let store = await this._safeTx();

				return new Promise(resolve => {
					const tx = store.transaction;
					const req = op(store);

					/* Transaction-level safety (Safari/iOS) */
					tx.onabort = () => {
						console.warn('[IndexedDBAdapter] Transaction aborted:', tx.error);
						resolve();
					};
					tx.onerror = () => {
						console.warn('[IndexedDBAdapter] Transaction error:', tx.error);
						resolve();
					};

					req.onerror = async () => {
						if (req.error?.name === 'InvalidStateError' ||
							req.error?.name === 'TransactionInactiveError') {
							console.warn('[IndexedDBAdapter] Retrying after DB invalidation.');
							this._db = null;

							store = await this._safeTx();
							const tx2 = store.transaction;
							const req2 = op(store);

							tx2.onabort = () => resolve();
							tx2.onerror = () => resolve();

							req2.onerror = () => {
								console.error('[IndexedDBAdapter] Retry failed:', req2.error);
								resolve();
							};
							req2.onsuccess = () => resolve();
							return;
						}

						console.warn('[IndexedDBAdapter] IndexedDB request error:', req.error);
						resolve();
					};
					req.onsuccess = () => resolve();
				});
			});
		}

		/* -------------------------------------------------------------
		* Public API
		* ----------------------------------------------------------- */
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
			if (typeof key !== 'string' || !key) return null;

			const data = this._cache.get(key);
			return data === undefined ? null : Serial.parse(data);
		}

		set(key, data) {
			if (typeof key !== 'string' || !key) return false;

			const str = Serial.stringify(data);
			this._cache.set(key, str);
			this._enqueue(store => store.put({ id : key, data : str }));

			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) return false;

			this._cache.delete(key);
			this._enqueue(store => store.delete(key));

			return true;
		}

		clear() {
			this._cache.clear();
			this._enqueue(store => store.clear());

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
