/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Squashed as Sq,
	Sequenced as S,
	Rebased as R,
} from "../format";
import { squash } from "../squash";
import {
	ScenarioF,
	ScenarioG,
} from "./samples";

function deepFreeze<T>(object: T): void {
	// Retrieve the property names defined on object
	const propNames = Object.getOwnPropertyNames(object);
	// Freeze properties before freezing self
	for (const name of propNames) {
		const value = object[name];
		if (value && typeof value === "object") {
			deepFreeze(value);
		}
	}
	Object.freeze(object);
}

function testSquash(
	changes: (Sq.ChangeFrame | S.Transaction)[],
): R.ChangeFrame {
	deepFreeze(changes);
	return squash(changes);
}

describe(squash.name, () => {
	it("Scenario F", () => {
		const actual = testSquash(
			[ScenarioF.e2neg, ScenarioF.e1, ScenarioF.e2posp],
		);
		assert.deepEqual(actual, ScenarioF.e3d);
	});

	describe("Scenario G", () => {
		it("Delta for e3", () => {
			const actual = testSquash(
				[ScenarioG.e2neg, ScenarioG.e1, ScenarioG.e2posp],
			);
			assert.deepEqual(actual, ScenarioG.e3d);
		});
		it("Delta for e4 (no reuse)", () => {
			const actual = testSquash(
				[
					ScenarioG.e3neg,
					ScenarioG.e2neg,
					ScenarioG.e1,
					ScenarioG.e2posp,
					ScenarioG.e3posp,
				],
			);
			assert.deepEqual(actual, ScenarioG.e4d);
		});
		it("Delta for e4 (reuse e3d)", () => {
			const actual = testSquash(
				[ScenarioG.e3neg, ScenarioG.e3d, ScenarioG.e3posp],
			);
			assert.deepEqual(actual, ScenarioG.e4d);
		});
		it("Delta for e5 (no reuse)", () => {
			const actual = testSquash(
				[
					ScenarioG.e4neg,
					ScenarioG.e3neg,
					ScenarioG.e2neg,
					ScenarioG.e1,
					ScenarioG.e2posp,
					ScenarioG.e3posp,
					ScenarioG.e4posp,
				],
			);
			assert.deepEqual(actual, ScenarioG.e5d);
		});
		it("Delta for e5 (reuse e4d)", () => {
			const actual = testSquash(
				[ScenarioG.e4neg, ScenarioG.e4d, ScenarioG.e4posp],
			);
			assert.deepEqual(actual, ScenarioG.e5d);
		});
	});
});
