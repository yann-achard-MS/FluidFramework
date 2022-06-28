/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { invert, Transposed as T } from "../../changeset";

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
							mods: [{
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
				modify: [{
					bar: {
						nodes: [
							{ type: "Delete", id: 3, count: 1 },
						],
					},
				}],
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
					{ count: 1, stack: [{ type: "Scorch", id: 0 }] },
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
					1,
					{ count: 2, seq },
				],
				nodes: [
					{ type: "Revive", id: 0, count: 1 },
					{ type: "Revive", id: 1, count: 1 },
					1,
					{ type: "Revive", id: 2, count: 2 },
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
					1,
					{ count: 2, seq },
				],
				nodes: [
					{ type: "Revive", id: 0, count: 2 },
					1,
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
// const setValue: T.Changeset = {
// 	marks: [{
// 		value: 1,
// 		modify: {
// 			foo: [
// 				{
// 					type: "SetValue",
// 					value: 1,
// 				},
// 			],
// 		},
// 	}],
// };
// const revertValue: T.Changeset = {
// 	marks: [{
// 		value: { seq },
// 		modify: {
// 			foo: [
// 				{
// 					type: "RevertValue",
// 					seq,
// 				},
// 			],
// 		},
// 	}],
// };
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

describe.skip(invert.name, () => {
	// it("SetValue -> RevertValue", () => {
	// 	const actual = testInvert(setValue);
	// 	assert.deepEqual(actual, revertValue);
	// });

	// it("RevertValue -> RevertValue", () => {
	// 	const actual = testInvert(revertValue);
	// 	assert.deepEqual(actual, revertValue);
	// });

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
});
