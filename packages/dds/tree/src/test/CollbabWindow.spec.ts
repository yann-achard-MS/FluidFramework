/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import structuredClone from "@ungap/structured-clone";
import { CollabWindow, ScenarioA2, SeqNumber, shrinkWindow } from "../MergeTree2";

function clone<T>(original: T): T {
	return structuredClone(original) as T;
}

const w_all_A2: CollabWindow = {
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

describe("CollabWindow", () => {
	describe(shrinkWindow.name, () => {
		function shrunk(window: CollabWindow, knownSeq: SeqNumber): CollabWindow {
			const copy = clone(window);
			shrinkWindow(copy, knownSeq);
			return copy;
		}

		it("no shrink", () => {
			const actual = shrunk(w_all_A2, 0);
			assert.deepEqual(actual, w_all_A2);
		});
		it("scenario A2", () => {
			const actual = shrunk(w_all_A2, 1);
			const expected: CollabWindow = {
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
			assert.deepEqual(actual, expected);
		});
	});
});
