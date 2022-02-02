/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import structuredClone from "@ungap/structured-clone";
import { SeqNumber } from "../Format";
import { CollabWindow, shrinkWindow } from "../Window";
import {
	ScenarioA1,
	ScenarioA2,
	ScenarioB,
	ScenarioC,
} from "./Samples";

function clone<T>(original: T): T {
	return structuredClone(original) as T;
}

const empty: CollabWindow = {
	transactions: [],
	changes: {},
};

const A1_w_all: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioA1.t_u1],
			ref: 0,
			seq: 1,
		},
		{
			frames: [ScenarioA1.t_u2],
			ref: 0,
			seq: 2,
		},
		{
			frames: [ScenarioA1.t_u3],
			ref: 0,
			seq: 3,
		},
	],
	changes: ScenarioA1.w_all,
};

const A1_w_u2u3: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioA1.t_u2],
			ref: 0,
			seq: 2,
		},
		{
			frames: [ScenarioA1.t_u3],
			ref: 0,
			seq: 3,
		},
	],
	changes: ScenarioA1.w_u2u3,
};

const A1_w_u3: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioA1.t_u3],
			ref: 0,
			seq: 3,
		},
	],
	changes: ScenarioA1.w_u3,
};

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

const B_w_all: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioB.t_u1],
			ref: 0,
			seq: 1,
		},
		{
			frames: [ScenarioB.t_u2],
			ref: 0,
			seq: 2,
		},
	],
	changes: ScenarioB.w_all,
};

const B_w_u2: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioB.t_u2],
			ref: 0,
			seq: 2,
		},
	],
	changes: ScenarioB.w_u2,
};

const C_w_all: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioC.t_u1e1],
			ref: 0,
			seq: 1,
		},
		{
			frames: [ScenarioC.t_u1e2],
			ref: 0,
			seq: 2,
		},
		{
			frames: [ScenarioC.t_u2],
			ref: 1,
			seq: 3,
		},
	],
	changes: ScenarioC.w_all,
};

const C_w_u1e2u2: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioC.t_u1e2],
			ref: 0,
			seq: 2,
		},
		{
			frames: [ScenarioC.t_u2],
			ref: 1,
			seq: 3,
		},
	],
	changes: ScenarioC.w_u1e2u2,
};

const C_w_u2: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioC.t_u2],
			ref: 1,
			seq: 3,
		},
	],
	changes: ScenarioC.w_u2,
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

		describe("Scenario A1", () => {
			it("all -> u2u3", () => {
				const actual = shrunk(A1_w_all, 1);
				assert.deepEqual(actual, A1_w_u2u3);
			});
			it("all -> u3", () => {
				const actual = shrunk(A1_w_all, 2);
				assert.deepEqual(actual, A1_w_u3);
			});
			it("all -> empty", () => {
				const actual = shrunk(A1_w_all, 3);
				assert.deepEqual(actual, empty);
			});
			it("u2u3 -> u3", () => {
				const actual = shrunk(A1_w_u2u3, 2);
				assert.deepEqual(actual, A1_w_u3);
			});
			it("u2u3 -> empty", () => {
				const actual = shrunk(A1_w_u2u3, 3);
				assert.deepEqual(actual, empty);
			});
			it("u3 -> empty", () => {
				const actual = shrunk(A1_w_u3, 3);
				assert.deepEqual(actual, empty);
			});
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
			it("all -> empty", () => {
				const actual = shrunk(A2_w_all, 3);
				assert.deepEqual(actual, empty);
			});
			it("u2u3 -> u3", () => {
				const actual = shrunk(A2_w_u2u3, 2);
				assert.deepEqual(actual, A2_w_u3);
			});
			it("u2u3 -> empty", () => {
				const actual = shrunk(A2_w_u2u3, 3);
				assert.deepEqual(actual, empty);
			});
			it("u3 -> empty", () => {
				const actual = shrunk(A2_w_u3, 3);
				assert.deepEqual(actual, empty);
			});
		});

		describe("Scenario B", () => {
			it("all -> u2", () => {
				const actual = shrunk(B_w_all, 1);
				assert.deepEqual(actual, B_w_u2);
			});
			it("all -> empty", () => {
				const actual = shrunk(B_w_all, 2);
				assert.deepEqual(actual, empty);
			});
			it("u2 -> empty", () => {
				const actual = shrunk(B_w_u2, 2);
				assert.deepEqual(actual, empty);
			});
		});

		describe("Scenario C", () => {
			it("all -> u1e2u2", () => {
				const actual = shrunk(C_w_all, 1);
				assert.deepEqual(actual, C_w_u1e2u2);
			});
			it("all -> u2", () => {
				const actual = shrunk(C_w_all, 2);
				assert.deepEqual(actual, C_w_u2);
			});
			it("all -> empty", () => {
				const actual = shrunk(C_w_all, 3);
				assert.deepEqual(actual, empty);
			});
			it("u1e2u2 -> u2", () => {
				const actual = shrunk(C_w_u1e2u2, 2);
				assert.deepEqual(actual, C_w_u2);
			});
			it("u2 -> empty", () => {
				const actual = shrunk(C_w_u2, 3);
				assert.deepEqual(actual, empty);
			});
		});
	});
});
