/* global Serial, SimpleStore, exceptionFrom */

SimpleStore.adapters.push((() => {
	// Adapter readiness state.
	let _ok = false;

	/*******************************************************************************
		IndexedDBAdapter Class.
	*******************************************************************************/

	class IndexedDBAdapter {
		constructor(storageId, persistent) {
			Object.defineProperties(this, {
				_cache     : { value : new Map() },
				_id        : { value : `${storageId}.` },
				name       : { value : 'IndexedDB' },
				id         : { value : storageId },
				persistent : { value : Boolean(persistent) }
			});

			if (this.persistent) {
				this._db   = null;
				this._open = null;
				this.ready = this._init();
			}
			else {
				this._db   = window.sessionStorage;
				this._save = false;
				this.initCache();
			}
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
			if (this._open) return this._open;

			this._open = this._openDB(this.id)
				.finally(() => { this._open = null; });

			return this._open;
		}

		_openDB(name) {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(name, 1);

				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains('SugarCube')) {
						db.createObjectStore('SugarCube', { keyPath : 'id' });
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
				const tx = this._db.transaction('SugarCube', 'readonly');
				const req = tx.objectStore('SugarCube').getAll();

				/* Important: catch transaction-level abort */
				tx.onabort = () => reject(tx.error);
				tx.onerror = () => reject(tx.error);

				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
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
				return this._db.transaction('SugarCube', mode).objectStore('SugarCube');
			}
			catch (err) {
				if (err.name === 'InvalidStateError' || err.name === 'TransactionInactiveError') {
					this._db = null;
					await this._ensureOpen();
					return this._db.transaction('SugarCube', mode).objectStore('SugarCube');
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
						if (req.error?.name === 'InvalidStateError' || req.error?.name === 'TransactionInactiveError') {
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
			if (typeof key !== 'string' || !key) return false;

			return this._cache.has(key);
		}

		get(key) {
			if (typeof key !== 'string' || !key) return null;

			return Serial.parse(this._cache.get(key) ?? null);
		}

		set(key, data) {
			if (typeof key !== 'string' || !key) return false;

			const str = Serial.stringify(data);
			this._cache.set(key, str);

			if (this.persistent) {
				this._enqueue(store => store.put({ id : key, data : str }));
			}
			else if (key === 'state') {
				this._save = true;
			}
			return true;
		}

		delete(key) {
			if (typeof key !== 'string' || !key) return false;

			this._cache.delete(key);

			if (this.persistent) {
				this._enqueue(store => store.delete(key));
			}
			else {
				this._db.removeItem(this._id + key);
			}
			return true;
		}

		clear() {
			this._cache.clear();

			if (this.persistent) {
				this._enqueue(store => store.clear());
			}
			else {
				this._db.clear();
			}
			return true;
		}

		save(key) {
			if (!this.has(key)) return;

			const isState = key === 'state';
			if (isState && !this._save) return;

			try {
				this._db.setItem(this._id + key, LZString.compressToUTF16(this._cache.get(key)));
				if (isState) this._save = false;
			}
			catch (ex) {
				// If the exception is a quota exceeded error, massage it into something
				// a bit nicer for the player.
				if (isQuotaDOMException(ex)) {
					throw exceptionFrom(ex, Error, {
						cause   : { origin : ex },
						message : `${this.name} quota exceeded`
					});
				}

				// Elsewise, simply rethrow the exception.
				throw ex;
			}
		}

		initCache() {
			for (let i = this._db.length; --i >= 0;) {
				const key = this._db.key(i);

				if (key.startsWith(this._id)) {
					this._cache.set(key.slice(this._id.length), LZString.decompressFromUTF16(this._db.getItem(key)));
				}
				else {
					this._db.removeItem(key);
				}
			}
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
		// Web Storage feature test.
		function hasWebStorage(storeId) {
			let store;

			try {
				store = window[storeId];
				const val = `_sc_${String(Date.now())}`;
				store.setItem(val, val);
				const result = store.getItem(val) === val;
				store.removeItem(val);
				return result;
			}
			catch (ex) {
				// Attempt to ensure that the exception was due to feature failure rather
				// than simply a quota error, which is possible due to browser stupidity.
				return store && store.length !== 0 && isQuotaDOMException(ex);
			}
		}
		// IndexedDB feature test.
		_ok = 'indexedDB' in window && hasWebStorage('sessionStorage');

		return _ok;
	}

	const isQuotaErrorRE = /quota.?(?:exceeded|reached)/i;

	function isQuotaDOMException(ex) {
		return ex instanceof DOMException
			&& (
				// The `.code` property is non-standard and not supported by all browsers,
				// but for legacy support test it first anyway.
				//
				// Legacy codes: `22` (non-Firefox) and `1014` (Firefox).
				ex.code === 22 || ex.code === 1014

				// If the `.code` test failed, resort to pattern matching the `.name` and
				// `.message` properties—the latter being required only by Opera (Presto).
				//
				// NOTE: The current standards compliant name is `"QuotaExceededError"`.
				// Legacy names: `"QUOTA_EXCEEDED_ERR"` (non-Firefox) and `"NS_ERROR_DOM_QUOTA_REACHED"` (Firefox).
				|| isQuotaErrorRE.test(ex.name) || isQuotaErrorRE.test(ex.message)
			);
	}

	/*******************************************************************************
		Object Exports.
	*******************************************************************************/

	return Object.preventExtensions(Object.create(null, {
		init   : { value : init },
		create : { value : create }
	}));
})());
