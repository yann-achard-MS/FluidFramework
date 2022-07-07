/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { invert, Transposed as T } from "../../changeset";
import { merge } from "../../util";

import { deepFreeze } from "../utils";

function testInvert(frame: T.Changeset): T.Changeset {
	deepFreeze(frame);
	// Why is this intermediary necessary to make eslint happy?
	const inverted: T.Changeset = invert(frame, seq);
	return inverted;
}

const seq = 42;

const insert: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				attach: [
					[
						{
							type: "Insert",
							id: 0,
							content: [{ id: "A" }],
							modify: [{
								bar: {
									attach: [
										[{ type: "Insert", id: 4, content: [{ id: "A2" }] }],
									],
								},
							}],
						},
						{ type: "Insert", id: 1, content: [{ id: "B" }] },
					],
					2,
					[{ type: "Insert", id: 2, content: [{ id: "E" }, { id: "F" }] }],
				],
				modify: [{
					bar: {
						attach: [
							[{ type: "Insert", id: 3, content: [{ id: "C2" }] }],
						],
					},
				}],
			},
		}],
	},
};
const deleteSet: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				nodes: [
					{ type: "Delete", id: 0, count: 1 },
					{ type: "Delete", id: 1, count: 1 },
					2,
					{ type: "Delete", id: 2, count: 2 },
				],
				modify: [
					{
						bar: {
							nodes: [
								{ type: "Delete", id: 4, count: 1 },
							],
						},
					},
					1, // B
					{
						bar: {
							nodes: [
								{ type: "Delete", id: 3, count: 1 },
							],
						},
					},
				],
			},
		}],
	},
};
const deleteSlice: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				nodes: [
					{ type: "Delete", id: 0, count: 2 },
					2,
					{ type: "Delete", id: 1, count: 2 },
				],
				gaps: [
					1,
					{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
					3,
					{ count: 1, stack: [{ type: "Scorch", id: 1 }] },
				],
			},
		}],
	},
};
const reviveSet: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				tombs: [
					{ count: 1, seq },
					{ count: 1, seq },
					2,
					{ count: 2, seq },
				],
				nodes: [
					{ type: "Revive", id: 0, count: 1 },
					{ type: "Revive", id: 1, count: 1 },
					2,
					{ type: "Revive", id: 2, count: 2 },
				],
				modify: [
					{
						bar: {
							tombs: [{ count: 1, seq }],
							nodes: [
								{ type: "Revive", id: 4, count: 1 },
							],
						},
					},
					1, // B
					{
						bar: {
							tombs: [{ count: 1, seq }],
							nodes: [
								{ type: "Revive", id: 3, count: 1 },
							],
						},
					},
				],
			},
		}],
	},
};
const reviveSlice: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				tombs: [
					{ count: 2, seq },
					2,
					{ count: 2, seq },
				],
				nodes: [
					{ type: "Revive", id: 0, count: 2 },
					2,
					{ type: "Revive", id: 1, count: 2 },
				],
				gaps: [
					1,
					{ count: 1, stack: [{ type: "Heal", id: 0 }] },
					3,
					{ count: 1, stack: [{ type: "Heal", id: 1 }] },
				],
			},
		}],
	},
};
const setValue: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				values: [2, { type: "Set", value: 1 }],
			},
		}],
	},
};
const setValueOnInsert: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				attach: [
					3,
					[{
						type: "Insert",
						id: 0,
						content: [{ id: "A" }, { id: "B" }],
						values: [1, { type: "Set", value: 1 }],
					}],
				],
				values: [
					1,
					{ type: "Set", value: 2 },
					2,
					{ type: "Set", value: 3 },
				],
			},
		}],
	},
};
const revertValue: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				values: [2, { type: "Revert", seq }],
			},
		}],
	},
};
const revertValueOnInsert: T.Changeset = {
	marks: {
		modify: [{
			foo: {
				nodes: [3, { type: "Delete", id: 0, count: 2 }],
				values: [
					1,
					{ type: "Revert", seq },
					2,
					{ type: "Revert", seq },
					1,
					{ type: "Revert", seq },
				],
			},
		}],
	},
};
const moveSetInTrait: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				nodes: [
					1, // A
					{ type: "Move", id: 0, count: 2 },
				],
				attach: [
					4, // [-A-B-C-D
					[{ type: "Move", id: 0, count: 2 }],
				],
			},
		}],
	},
};
const moveSliceInTrait: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				nodes: [
					1, // A
					{ type: "Move", id: 0, count: 2 },
				],
				gaps: [
					2, // [-A-B
					{ count: 1, stack: [{ type: "Forward", id: 0 }] },
				],
				attach: [
					4, // [-A-B-C-D
					[{ type: "Move", id: 0, count: 2 }],
				],
			},
		}],
	},
};
const returnSetInTrait: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					1, // A
					{ count: 2, seq }, // B C
				],
				nodes: [
					1, // A
					{ type: "Return", id: 0, count: 2 },
					1, // D
					{ type: "Move", id: 0, count: 2 },
				],
			},
		}],
	},
};
const returnSliceInTrait: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					1, // A
					{ count: 2, seq }, // B C
				],
				nodes: [
					1, // A
					{ type: "Return", id: 0, count: 2 },
					1, // D
					{ type: "Move", id: 0, count: 2 },
				],
				gaps: [
					2, // [-A-B
					{ count: 1, stack: [{ type: "Unforward", id: 0 }] },
				],
			},
		}],
	},
};
const returnTwiceSetInTrait: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					4, // A B C D
					{ count: 2, seq }, // B C
				],
				nodes: [
					1, // A
					{ type: "Move", id: 0, count: 2 }, // B C
					1, // D
					{ type: "Return", id: 0, count: 2 }, // B C (tombs)
				],
			},
		}],
	},
};
const returnTwiceSliceInTrait: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					4, // A B C D
					{ count: 2, seq }, // B C
				],
				nodes: [
					1, // A
					{ type: "Move", id: 0, count: 2 }, // B C
					1, // D
					{ type: "Return", id: 0, count: 2 }, // B C (tombs)
				],
				gaps: [
					2, // [-A-B
					{ count: 1, stack: [{ type: "Forward", id: 0 }] },
				],
			},
		}],
	},
};
const changesUnderMove: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				nodes: [
					1, // A
					{ type: "Move", id: 0, count: 2 },
				],
				attach: [
					4, // [-A-B-C-D
					[{ type: "Move", id: 0, count: 2 }],
				],
				modify: [
					1,
					{
						bar: {
							nodes: [{ type: "Delete", id: 1, count: 1 }],
						},
					},
				],
				values: [2, { type: "Set", value: 42 }],
			},
		}],
	},
};
const invertChangesUnderMove: T.Changeset = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					1, // A
					{ count: 2, seq }, // B C
				],
				nodes: [
					1, // A
					{ type: "Return", id: 0, count: 2 },
					1, // D
					{ type: "Move", id: 0, count: 2 },
				],
				modify: [
					4,
					{
						bar: {
							tombs: [{ count: 1, seq }],
							nodes: [{ type: "Revive", id: 1, count: 1 }],
						},
					},
				],
				values: [5, { type: "Revert", seq }],
			},
		}],
	},
};

describe(invert.name, () => {
	describe("SetValue -> RevertValue", () => {
		it("Under existing content", () => {
			const actual = testInvert(setValue);
			assert.deepEqual(actual, revertValue);
		});
		it("Under inserted content", () => {
			const actual = testInvert(setValueOnInsert);
			assert.deepEqual(actual, revertValueOnInsert);
		});
	});

	it("RevertValue -> RevertValue", () => {
		const actual = testInvert(revertValue);
		assert.deepEqual(actual, revertValue);
	});

	it("Insert -> Delete", () => {
		const actual = testInvert(insert);
		assert.deepEqual(actual, deleteSet);
	});

	describe("Delete -> Revive", () => {
		it("For set ranges", () => {
			const actual = testInvert(deleteSet);
			assert.deepEqual(actual, reviveSet);
		});
		it("For slice ranges", () => {
			const actual = testInvert(deleteSlice);
			assert.deepEqual(actual, reviveSlice);
		});
	});

	describe("Revive -> Delete", () => {
		it("For set ranges", () => {
			const actual = testInvert(reviveSet);
			assert.deepEqual(actual, deleteSet);
		});
		it("For slice ranges", () => {
			const actual = testInvert(reviveSlice);
			assert.deepEqual(actual, deleteSlice);
		});
	});

	describe("[MoveOut MoveIn] -> [Return MoveOut]", () => {
		describe("For set ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(moveSetInTrait);
				assert.deepEqual(actual, returnSetInTrait);
			});
		});
		describe("For slice ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(moveSliceInTrait);
				assert.deepEqual(actual, returnSliceInTrait);
			});
		});
	});

	describe("[Return MoveOut] -> [MoveOut Return]", () => {
		describe("For set ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnSetInTrait);
				assert.deepEqual(actual, returnTwiceSetInTrait);
			});
		});
		describe("For slice ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnSliceInTrait);
				assert.deepEqual(actual, returnTwiceSliceInTrait);
			});
		});
	});

	describe("[MoveOut Return] -> [Return MoveOut]", () => {
		describe("For set ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnTwiceSetInTrait);
				assert.deepEqual(actual, returnSetInTrait);
			});
		});
		describe("For slice ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnTwiceSliceInTrait);
				assert.deepEqual(actual, returnSliceInTrait);
			});
		});
	});

	it("Changes under moved nodes", () => {
		const actual = testInvert(changesUnderMove);
		const d = merge(actual, invertChangesUnderMove);
		assert.deepEqual(actual, invertChangesUnderMove);
	});
});
