/***********************************************************************************************************************

	macro/macros/widget.js

	Copyright © 2013–2024 Thomas Michael Edwards <thomasmedwards@gmail.com>. All rights reserved.
	Use of this source code is governed by a BSD 2-clause "Simplified" License, which may be found in the LICENSE file.

***********************************************************************************************************************/
/* global Macro, State, Wikifier */

/*
	<<widget>>
*/
Macro.add('widget', {
	tags : null,

	handler() {
		if (this.args.length === 0) {
			return this.error('no widget name specified');
		}

		const widgetName = this.args[0];
		const isNonVoid  = this.args.length > 1 && this.args[1] === 'container';

		if (Macro.has(widgetName)) {
			return this.error(`cannot clobber existing ${Macro.get(widgetName).isWidget ? 'widget' : 'macro'} "${widgetName}"`);
		}

		try {
			const widgetDef = {
				isWidget : true,
				handler  : (function (widgetCode) {
					return function () {
						const shadowStore = {};

						// Cache the existing value of the `_args` variable, if necessary.
						if (Object.hasOwn(State.temporary, 'args')) {
							shadowStore._args = State.temporary.args;
						}

						// Set up the widget `_args` variable and add a shadow.
						State.temporary.args = Array.from(this.args);
						State.temporary.args.raw = this.args.raw;
						State.temporary.args.full = this.args.full;
						State.temporary.args.name = this.name;
						this.addShadow('_args');

						if (isNonVoid) {
							// Cache the existing value of the `_contents` variable, if necessary.
							if (Object.hasOwn(State.temporary, 'contents')) {
								shadowStore._contents = State.temporary.contents;
							}

							// Set up the widget `_contents` variable and add a shadow.
							State.temporary.contents = this.payload[0].contents;
							this.addShadow('_contents');
						}

						try {
							// Set up the error trapping variables.
							const resFrag = document.createDocumentFragment();
							const errList = [];

							// Wikify the widget's code.
							new Wikifier(resFrag, widgetCode);

							// Carry over the output, unless there were errors.
							Array.from(resFrag.querySelectorAll('.error')).forEach(errEl => {
								errList.push(errEl.textContent);
							});

							if (errList.length === 0) {
								this.output.appendChild(resFrag);
							}
							else {
								return this.error(`error${errList.length > 1 ? 's' : ''} within widget code (${errList.join('; ')})`);
							}
						}
						catch (ex) {
							return this.error(`cannot execute widget: ${ex.message}`);
						}
						finally {
							// Revert the `_args` variable shadowing.
							if (Object.hasOwn(shadowStore, '_args')) {
								State.temporary.args = shadowStore._args;
							}
							else {
								delete State.temporary.args;
							}

							if (isNonVoid) {
								// Revert the `_contents` variable shadowing.
								if (Object.hasOwn(shadowStore, '_contents')) {
									State.temporary.contents = shadowStore._contents;
								}
								else {
									delete State.temporary.contents;
								}
							}
						}
					};
				})(this.payload[0].contents)
			};

			if (isNonVoid) {
				widgetDef.tags = [];
			}

			Macro.add(widgetName, widgetDef);
		}
		catch (ex) {
			return this.error(`cannot create widget macro "${widgetName}": ${ex.message}`);
		}
	}
});
