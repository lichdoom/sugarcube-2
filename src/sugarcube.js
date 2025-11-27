/***********************************************************************************************************************

	sugarcube.js

	Copyright © 2013–2025 Thomas Michael Edwards <thomasmedwards@gmail.com>. All rights reserved.
	Use of this source code is governed by a BSD 2-clause "Simplified" License, which may be found in the LICENSE file.

***********************************************************************************************************************/
/*
	global Alert, Browser, Config, Dialog, Engine, Fullscreen, Has, LoadScreen, SimpleStore, L10n, Macro,
	       Outlines, Passage, Save, Scripting, Setting, SimpleAudio, State, Story, UI, UIBar, DebugBar,
	       Util, Visibility, Wikifier, WikifierUtil, session:writeable, settings, setup, storage:writeable,
	       triggerEvent, version
*/

/*******************************************************************************
	Main function.  Entry point for the story.
*******************************************************************************/

jQuery(() => {
	if (BUILD_DEBUG) { console.log('[SugarCube/main()] Document loaded; beginning startup.'); }

	/*
		WARNING!

		The ordering of the code within this function is critically important,
		so be careful when mucking around with it.
	*/

	// Acquire an initial lock for and initialize the loading screen.
	const lockId = LoadScreen.lock();
	LoadScreen.init();

	// Normalize the document.
	if (document.normalize) {
		document.normalize();
	}

	// From this point on it's promises all the way down.
	new Promise(async resolve => {
		// Initialize the story.
		Story.init();

		// Initialize the databases.
		try {
			SugarCube.storage = storage = SimpleStore.create(Story.id, true);  // eslint-disable-line no-undef
			SugarCube.session = session = SimpleStore.create(Story.id, false); // eslint-disable-line no-undef
		}
		catch (ex) {
			throw new Error(L10n.get('warningNoStorage'));
		}
		// Wait for the cache to be populated
		await Promise.all([session.ready, storage.ready]);

		// Detect a brand-new tab
		if (!sessionStorage.getItem(Story.id)) {
			sessionStorage.setItem(Story.id, true);
			session.clear();
		}

		// Initialize the user interfaces.
		//
		// NOTE: Must be done before user scripts are loaded.
		Dialog.init();
		UIBar.init();
		Engine.init();
		Outlines.init();

		// Run user scripts (user stylesheet, JavaScript, and widgets).
		Engine.runUserScripts();

		// Initialize the localization (must be done after user scripts).
		L10n.init();

		// Initialize the saves.
		Save.init();

		// Initialize the settings.
		Setting.init();

		// Initialize the macros.
		Macro.init();

		// Initialize the debug bar interface.
		DebugBar.init();

		// Schedule the start of the engine and interfaces once both the DOM is
		// reporting non-empty dimensions for the viewport and our loading screen
		// lock is the only remaining one.
		const $window   = jQuery(window);
		const vpReadyId = setInterval(() => {
			if ($window.width() && LoadScreen.size <= 1) {
				clearInterval(vpReadyId);
				resolve();
			}
		}, Engine.DOM_DELAY);
	})
		.then(() => {
			// Run the user init passages.
			Engine.runUserInit();

			// Start the UI bar interface.
			UIBar.start();

			// Start the engine.
			Engine.start();

			// Start the debug bar interface.
			DebugBar.start();

			// Trigger the `:storyready` global synthetic event.
			triggerEvent(':storyready');

			// Release our loading screen lock after a short delay.
			setTimeout(() => LoadScreen.unlock(lockId), Engine.DOM_DELAY * 2);

			if (BUILD_DEBUG) { console.log('[SugarCube/main()] Startup complete; story ready.'); }
		})
		.catch(ex => {
			console.error(ex);
			LoadScreen.clear();
			return Alert.fatal(null, ex.message, ex);
		});
});


/*******************************************************************************
	`SugarCube` object.
*******************************************************************************/

/*
	Contains exported identifiers for debugging purposes and allows scripts to
	detect if they're running in SugarCube.
*/
Object.defineProperty(window, 'SugarCube', {
	// WARNING: We need to assign new values at points, so seal it, do not freeze it.
	value : Object.seal(Object.assign(Object.create(null), {
		Browser,
		Config,
		Dialog,
		Engine,
		Fullscreen,
		Has,
		L10n,
		Macro,
		Passage,
		Save,
		Scripting,
		Setting,
		SimpleAudio,
		State,
		Story,
		UI,
		UIBar,
		DebugBar,
		Visibility,
		Wikifier,
		WikifierUtil,
		session,
		settings,
		setup,
		storage,
		version

		/* [DEPRECATED] */
		/* eslint-disable comma-style */
		, Util
		/* eslint-enable comma-style */
		/* [/DEPRECATED] */
	}))
});
