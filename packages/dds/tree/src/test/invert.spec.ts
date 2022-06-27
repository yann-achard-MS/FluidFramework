/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Rebased as R,
} from "../format";
import { invert } from "../invert";
import { deepFreeze } from "./utils";

function testInvert(frame: R.ChangeFrame): R.ChangeFrame {
	deepFreeze(frame);
	return invert(frame, seq);
}

const seq = 42;

const insert: R.ChangeFrame = {
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
const deleteSet: R.ChangeFrame = {
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
const deleteSlice: R.ChangeFrame = {
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
					{ count: 1, stack: [ { type: "Scorch", id: 0 } ] },
					3,
					{ count: 1, stack: [ { type: "Scorch", id: 0 } ] },
				],
			},
		}],
	},
};
const reviveSet: R.ChangeFrame = {
	marks: {
		modify: [{
			foo: {
				tombs: [
					{ count: 1, seq, id: 0 },
					{ count: 1, seq, id: 1 },
					1,
					{ count: 2, seq, id: 2 },
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
const reviveSlice: R.ChangeFrame = {
	marks: {
		modify: [{
			foo: {
				tombs: [
					{ count: 2, seq, id: 0 },
					1,
					{ count: 2, seq, id: 1 },
				],
				nodes: [
					{ type: "Revive", id: 0, count: 2 },
					1,
					{ type: "Revive", id: 1, count: 2 },
				],
				gaps: [
					1,
					{ count: 1, stack: [ { type: "Heal", id: 0 } ] },
					3,
					{ count: 1, stack: [ { type: "Heal", id: 1 } ] },
				],
			},
		}],
	},
};
// const setValue: R.ChangeFrame = {
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
// const revertValue: R.ChangeFrame = {
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
const moveSetInTrait: R.ChangeFrame = {
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
const moveSliceInTrait: R.ChangeFrame = {
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
const returnSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					1, // A
					{ count: 2, seq, id: 0 }, // B C
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
const returnSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					1, // A
					{ count: 2, seq, id: 0 }, // B C
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
const returnTwiceSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					4, // A B C D
					{ count: 2, seq, id: 0 }, // B C
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
const returnTwiceSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		modify: [{
			foo: {
				tombs: [
					4, // A B C D
					{ count: 2, seq, id: 0 }, // B C
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

describe(invert.name, () => {
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
