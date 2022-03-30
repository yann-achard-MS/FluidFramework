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
	ScenarioA1,
	ScenarioA2,
	ScenarioC,
	ScenarioF,
	ScenarioG,
} from "./samples";
import { deepFreeze } from "./utils";

function rebase(original: R.Transaction, base: S.Transaction): R.Transaction {
	deepFreeze(original);
	deepFreeze(base);
	return rebaseImpl(original, base);
}

describe(rebase.name, () => {
	describe("ScenarioA1", () => {
		it("e2", () => {
			const actual = rebase(ScenarioA1.e2, ScenarioA1.e1);
			assert.deepEqual(actual.frames, ScenarioA1.e2p.frames);
		});
	});

	describe("ScenarioA2", () => {
		it("e2", () => {
			const actual = rebase(ScenarioA2.e2, ScenarioA2.e1);
			assert.deepEqual(actual.frames, ScenarioA2.e2p.frames);
		});
	});

	describe("ScenarioC", () => {
		it("e2", () => {
			const actual = rebase(ScenarioC.e3, ScenarioC.e2);
			assert.deepEqual(actual.frames, ScenarioC.e3p.frames);
		});
	});

	describe("ScenarioF", () => {
		it("e2", () => {
			const actual = rebase(ScenarioF.e2, ScenarioF.e1);
			assert.deepEqual(actual.frames, ScenarioF.e2p.frames);
		});
	});

	describe("ScenarioG", () => {
		it("e2", () => {
			const actual = rebase(ScenarioG.e2, ScenarioG.e1);
			assert.deepEqual(actual.frames, ScenarioG.e2p.frames);
		});
	});
});
