/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import structuredClone from "@ungap/structured-clone";
import { CollabWindow, ScenarioA2, SeqNumber, shrinkWindow } from "../Format";

function clone<T>(original: T): T {
	return structuredClone(original) as T;
}

const A2_w_all: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioA2.t_u1],
			ref: 0,
			seq: 1,
		},
		{
			frames: [ScenarioA2.t_u2],
			ref: 0,
			seq: 2,
		},
		{
			frames: [ScenarioA2.t_u3],
			ref: 0,
			seq: 3,
		},
	],
	changes: ScenarioA2.w_all,
};

const A2_w_u2u3: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioA2.t_u2],
			ref: 0,
			seq: 2,
		},
		{
			frames: [ScenarioA2.t_u3],
			ref: 0,
			seq: 3,
		},
	],
	changes: ScenarioA2.w_u2u3,
};

const A2_w_u3: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioA2.t_u3],
			ref: 0,
			seq: 3,
		},
	],
	changes: ScenarioA2.w_u3,
};

describe("CollabWindow", () => {
	describe(shrinkWindow.name, () => {
		function shrunk(window: CollabWindow, knownSeq: SeqNumber): CollabWindow {
			const copy = clone(window);
			shrinkWindow(copy, knownSeq);
			return copy;
		}

		it("no shrink", () => {
			const actual = shrunk(A2_w_all, 0);
			assert.deepEqual(actual, A2_w_all);
		});
		describe("Scenario A2", () => {
			it("all -> u2u3", () => {
				const actual = shrunk(A2_w_all, 1);
				assert.deepEqual(actual, A2_w_u2u3);
			});
			it("all -> u3", () => {
				const actual = shrunk(A2_w_all, 2);
				assert.deepEqual(actual, A2_w_u3);
			});
			it("u2u3 -> u3", () => {
				const actual = shrunk(A2_w_u2u3, 2);
				assert.deepEqual(actual, A2_w_u3);
			});
		});
	});
});
