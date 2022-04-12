/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { postbase as postbaseImpl } from "../postbase";
import {
	Sequenced as S,
	Rebased as R,
} from "../format";
import {
	ScenarioA1,
	ScenarioA2,
	ScenarioB,
	ScenarioD,
	ScenarioE,
	ScenarioF,
	ScenarioG,
} from "./samples";
import { deepFreeze } from "./utils";

function postbase(original: R.Transaction, base: S.Transaction): R.Transaction {
	deepFreeze(original);
	deepFreeze(base);
	return postbaseImpl(original, base);
}

describe(postbase.name, () => {
	describe("Basic Segments Matrix", () => {
	});

	describe.skip("Scenarios", () => {
		describe("ScenarioA1", () => {
			it("e2", () => {
				const actual = postbase(ScenarioA1.e2, ScenarioA1.e1);
				assert.deepEqual(actual.frames, ScenarioA1.e2p.frames);
			});
		});

		describe("ScenarioA2", () => {
			it("e2", () => {
				const actual = postbase(ScenarioA2.e2, ScenarioA2.e1);
				assert.deepEqual(actual.frames, ScenarioA2.e2p.frames);
			});
		});

		describe("ScenarioB", () => {
			it("e2", () => {
				const actual = postbase(ScenarioB.e3, ScenarioB.e2);
				assert.deepEqual(actual.frames, ScenarioB.e3p.frames);
			});
		});

		describe("ScenarioD", () => {
			it("e2", () => {
				const actual = postbase(ScenarioD.e2, ScenarioD.e1);
				assert.deepEqual(actual.frames, ScenarioD.e2p.frames);
			});
		});

		describe("ScenarioE", () => {
			it("e2", () => {
				const actual = postbase(ScenarioE.e2, ScenarioE.e1);
				assert.deepEqual(actual.frames, ScenarioE.e2p.frames);
			});
		});

		describe("ScenarioF", () => {
			it("e2", () => {
				const actual = postbase(ScenarioF.e2, ScenarioF.e1);
				assert.deepEqual(actual.frames, ScenarioF.e2p.frames);
			});
		});

		describe("ScenarioG", () => {
			it("e2", () => {
				const actual = postbase(ScenarioG.e2, ScenarioG.e1);
				assert.deepEqual(actual.frames, ScenarioG.e2p.frames);
			});
		});
	});
});
