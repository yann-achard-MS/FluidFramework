/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// import {
// 	Sequenced as S,
// 	Rebased as R,
// 	Offset,
// 	SeqNumber,
// } from "../format";
import { squash } from "../squash";
import {
	allOriginals,
	ScenarioF,
} from "./samples";

describe(squash.name, () => {
	it("single", () => {
		for (const original of allOriginals) {
			const actual = squash([original]);
			assert.deepEqual(actual, original.frames[0]);
		}
	});

	it.only("Scenario F", () => {
		const actual = squash([ScenarioF.e2inv, ScenarioF.e1, ScenarioF.e2_r_e1]);
		assert.deepEqual(actual, ScenarioF.e1.frames[0]);
	});
});
