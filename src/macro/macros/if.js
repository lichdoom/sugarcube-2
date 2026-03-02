/***********************************************************************************************************************

	macro/macros/if.js

	Copyright © 2013–2024 Thomas Michael Edwards <thomasmedwards@gmail.com>. All rights reserved.
	Use of this source code is governed by a BSD 2-clause "Simplified" License, which may be found in the LICENSE file.

***********************************************************************************************************************/
/* global Macro, Scripting, Wikifier, getErrorMessage */

/*
	<<if>>, <<elseif>>, & <<else>>
*/
Macro.add('if', {
	skipArgs : true,
	tags     : ['elseif', 'else'],

	// Sanity check regular expressions.
	isElseifWsRE : /^\s*if\b/i,

	handler() {
		let i;

		try {
			const len = this.payload.length;

			// Sanity checks.
			const isElseifWsRE = this.self.isElseifWsRE;

			for (/* declared previously */ i = 0; i < len; ++i) {
				switch (this.payload[i].name) {
					case 'else': {
						if (this.payload[i].args.raw.length > 0) {
							if (isElseifWsRE.test(this.payload[i].args.raw)) {
								return this.error(`whitespace is not allowed between the "else" and "if" in <<elseif>> clause${i > 0 ? ` (#${i})` : ''}`);
							}

							return this.error(`<<else>> does not accept a conditional expression (perhaps you meant to use <<elseif>>), invalid: ${this.payload[i].args.raw}`);
						}

						if (i + 1 !== len) {
							return this.error('<<else>> must be the final clause');
						}

						break;
					}

					default: {
						if (this.payload[i].args.full.length === 0) {
							return this.error(`no conditional expression specified for <<${this.payload[i].name}>> clause${i > 0 ? ` (#${i})` : ''}`);
						}

						break;
					}
				}
			}

			const evalJavaScript = Scripting.evalJavaScript;

			// Evaluate the clauses.
			for (/* declared previously */ i = 0; i < len; ++i) {
				// Conditional test.
				if (this.payload[i].name === 'else' || !!evalJavaScript(this.payload[i].args.full)) {
					new Wikifier(this.output, this.payload[i].contents);
					break;
				}
			}
		}
		catch (ex) {
			return this.error(`bad conditional expression in <<${i === 0 ? 'if' : 'elseif'}>> clause${i > 0 ? ` (#${i})` : ''}: ${getErrorMessage(ex)}`);
		}
	}
});
