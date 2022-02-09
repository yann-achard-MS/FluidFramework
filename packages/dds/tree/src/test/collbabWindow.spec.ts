/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SeqNumber } from "../format";
import { clone } from "../utils";
import { CollabWindow, shrinkWindow } from "../window";
import {
	ScenarioA1,
	ScenarioA2,
	ScenarioC,
	ScenarioD,
	ScenarioE,
	SwapCousins,
	SwapParentChild,
} from "./samples";

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

const E_w_all: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioE.t_u1],
			ref: 0,
			seq: 1,
		},
		{
			frames: [ScenarioE.t_u2],
			ref: 0,
			seq: 2,
		},
	],
	changes: ScenarioE.w_u2,
};

const E_w_u2: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioE.t_u2],
			ref: 0,
			seq: 2,
		},
	],
	changes: ScenarioE.w_u2,
};

const D_w_all: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioD.t_u1],
			ref: 0,
			seq: 1,
		},
		{
			frames: [ScenarioD.t_u2],
			ref: 0,
			seq: 2,
		},
	],
	changes: ScenarioD.w_u2,
};

const D_w_u2: CollabWindow = {
	transactions: [
		{
			frames: [ScenarioD.t_u2],
			ref: 0,
			seq: 2,
		},
	],
	changes: ScenarioD.w_u2,
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

		describe("Scenario D", () => {
			it("all -> u2", () => {
				const actual = shrunk(D_w_all, 1);
				assert.deepEqual(actual, D_w_u2);
			});
			it("all -> empty", () => {
				const actual = shrunk(D_w_all, 2);
				assert.deepEqual(actual, empty);
			});
			it("u2 -> empty", () => {
				const actual = shrunk(D_w_u2, 2);
				assert.deepEqual(actual, empty);
			});
		});

		describe("Scenario E", () => {
			it("all -> u2", () => {
				const actual = shrunk(E_w_all, 1);
				assert.deepEqual(actual, E_w_u2);
			});
			it("all -> empty", () => {
				const actual = shrunk(E_w_all, 2);
				assert.deepEqual(actual, empty);
			});
			it("u2 -> empty", () => {
				const actual = shrunk(E_w_u2, 2);
				assert.deepEqual(actual, empty);
			});
		});

		describe("SwapCousins", () => {
			it("w1 -> empty", () => {
				const w1: CollabWindow = {
					transactions: [
						{
							frames: [SwapCousins.e1],
							ref: 0,
							seq: 1,
						},
					],
					changes: SwapCousins.w1,
				};
				const actual = shrunk(w1, 1);
				assert.deepEqual(actual, empty);
			});
			it("w2 -> empty", () => {
				const w2: CollabWindow = {
					transactions: [
						{
							frames: [SwapCousins.e2],
							ref: 0,
							seq: 1,
						},
					],
					changes: SwapCousins.w2,
				};
				const actual = shrunk(w2, 1);
				assert.deepEqual(actual, empty);
			});
		});

		describe("SwapParentChild", () => {
			it("w1 -> empty", () => {
				const w1: CollabWindow = {
					transactions: [
						{
							frames: [SwapParentChild.e1],
							ref: 0,
							seq: 1,
						},
					],
					changes: SwapParentChild.w1,
				};
				const actual = shrunk(w1, 1);
				assert.deepEqual(actual, empty);
			});
		});
	});
});
