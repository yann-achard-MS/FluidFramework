/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { rebase as rebaseImpl } from "../rebase";
import {
	Sequenced as S,
	Rebased as R,
} from "../format";
import {
	ScenarioF,
} from "./samples";
import { deepFreeze } from "./utils";

function rebase(original: R.Transaction, base: S.Transaction): R.Transaction {
	deepFreeze(original);
	deepFreeze(base);
	return rebaseImpl(original, base);
}

describe(rebase.name, () => {
	describe("ScenarioF", () => {
		it("e2", () => {
			const actual = rebase(ScenarioF.e2, ScenarioF.e1);
			assert.deepEqual(actual.frames, ScenarioF.e2p.frames);
		});
	});
});
