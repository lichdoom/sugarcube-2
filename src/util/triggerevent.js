/***********************************************************************************************************************

	util/triggerevent.js

	Copyright © 2022–2024 Thomas Michael Edwards <thomasmedwards@gmail.com>. All rights reserved.
	Use of this source code is governed by a BSD 2-clause "Simplified" License, which may be found in the LICENSE file.

***********************************************************************************************************************/

/*
	Triggers an event with the given name and options on the given element.

	NOTE: Intended to replace SugarCube's use of jQuery's event triggering methods
	as they treat synthetic events suboptimally when compared to standard events.

	Options object properties:
		// Whether the event bubbles (default: true).
		bubbles?: boolean
		// Whether the event is cancelable (default: true).
		cancelable?: boolean
		// Whether the event triggers listeners outside of a shadow root (default: false).
		composed?: boolean
		// Custom data sent with the event (default: none).
		detail?: any
*/
var triggerEvent = (() => { // eslint-disable-line no-unused-vars, no-var
	const createEvent = (() => {
		try {
			// Test if the `CustomEvent` API is supported.
			new CustomEvent('click', { bubbles : true });

			// If the `CustomEvent` API is supported, then return a version of
			// the `createEvent()` function that uses it.
			return function createEvent(name, options) {
				const {
					bubbles,
					cancelable,
					composed,
					detail,
					...custom
				} = Object.assign({ bubbles : true, cancelable : true, composed : false }, options);
				const event = new CustomEvent(name, { bubbles, cancelable, composed, detail });

				// Copy all custom options properties to the event object.
				for (let i = 0, keys = Object.keys(custom); i < keys.length; ++i) {
					const key = keys[i];

					if (typeof custom[key] !== 'undefined') {
						event[key] = options[key];
					}
				}

				return event;
			};
		}
		catch (ex) {
		}
	})();

	function triggerEvent(name, targets, options) {
		const event = createEvent(name, options);
		const elems = [];

		// No target was specified, default to `document`.
		if (!targets) {
			elems.push(document);
		}

		// An element collection of some kind.
		else if (
			targets instanceof jQuery
			|| targets instanceof NodeList
			|| targets instanceof Array
		) {
			for (let i = 0; i < targets.length; ++i) {
				elems.push(targets[i]);
			}
		}

		// Anything else.
		else {
			elems.push(targets);
		}

		// Dispatch the event to all of the targets, in order.
		for (let i = 0; i < elems.length; ++i) {
			elems[i].dispatchEvent(event);
		}
	}

	return triggerEvent;
})();
