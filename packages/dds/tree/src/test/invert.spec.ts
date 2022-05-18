/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AffixCount,
	NodeCount,
	RangeType,
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
		attach: [
			[
				{
					type: "Insert",
					id: 0,
					content: [{ id: "A1" }],
				},
				{
					type: "Insert",
					id: 1,
					content: [{ id: "A2" }],
				},
			],
			3,
			[
				{
					type: "Insert",
					id: 1,
					content: [{ id: "B" }, { id: "C" }, { id: "D" }],
					mods: [
						1,
						{
							modify: {
								bar: {
									attach: [
										[{
											type: "Insert",
											id: 2,
											content: [{ id: "CA" }],
										}],
									],
								},
							},
						},
					],
				},
			],
		],
	},
};
const deleteSet: R.ChangeFrame = {
	marks: {
		nodes: [
			{
				id: 0,
				type: "Delete",
				count: 2,
			},
			1,
			{
				type: "Delete",
				id: 1,
				count: 3,
			},
		],
	},
};
const deleteSlice: R.ChangeFrame = {
	marks: {
		nodes: [
			{
				id: 0,
				type: "Delete",
				count: 2,
			},
			1,
			{
				type: "Delete",
				id: 1,
				count: 3,
			},
		],
		affixes: [
			2,
			{
				count: 8,
				stack: [ { type: "Scorch", id: 0 } ],
			},
			6,
			{
				count: 8,
				stack: [ { type: "Scorch", id: 0 } ],
			},
		],
	},
};
const reviveSet: R.ChangeFrame = {
	marks: {
		priors: [
			{ count: 2, seq, id: 0 },
			1,
			{ count: 3, seq, id: 1 },
		],
		nodes: [
			{
				type: "Revive",
				id: 0,
				count: 2,
			},
			1,
			{
				type: "Revive",
				id: 1,
				count: 3,
			},
		],
	},
};
const reviveSlice: R.ChangeFrame = {
	marks: {
		priors: [
			{ count: 2, seq, id: 0 },
			1,
			{ count: 3, seq, id: 1 },
		],
		nodes: [
			{
				type: "Revive",
				id: 0,
				count: 2,
			},
			1,
			{
				type: "Revive",
				id: 1,
				count: 3,
			},
		],
		affixes: [
			2,
			{
				count: 8,
				stack: [ { type: "Heal", id: 0 } ],
			},
			6,
			{
				count: 8,
				stack: [ { type: "Heal", id: 1 } ],
			},
		],
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
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						attach: [
							4,
							[{ type: "Move", id: 0, count: 1 }],
						],
						nodes: [
							2,
							{ type: "Move", id: 0, count: 1 },
						],
					},
				},
			},
		],
	},
};
const moveSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						attach: [
							4,
							[{ type: "Move", id: 0, count: 1 }],
						],
						nodes: [
							2,
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							10,
							{
								count: 4,
								stack: [ { type: "Forward", id: 0 } ],
							},
						],
					},
				},
			},
		],
	},
};
const moveSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
					},
					bar: {
						attach: [
							[{ type: "Move", id: 0, count: 1 }],
						],
					},
				},
			},
		],
	},
};
const moveSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						nodes: [
							2,
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							10,
							{
								count: 4,
								stack: [ { type: "Forward", id: 0 } ],
							},
						],
					},
					bar: {
						attach: [
							2,
							[{ type: "Move", id: 0, count: 1 }],
						],
					},
				},
			},
		],
	},
};
const returnSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						tombs: [
							3,
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							1,
							{ type: "Move", id: 0, count: 1 },
							1,
							{ type: "Return", id: 0, count: 1 },
						],
					},
				},
			},
		],
	},
};
const returnSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						tombs: [
							3,
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							1,
							{ type: "Move", id: 0, count: 1 },
							1,
							{ type: "Return", id: 0, count: 1 },
						],
						affixes: [
							10,
							{
								count: 4,
								stack: [ { type: "Unforward", id: 0 } ],
							},
						],
					},
				},
			},
		],
	},
};
const returnSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { bar: 0 }, dst: { foo: 0 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						tombs: [
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							{ type: "Return", id: 0, count: 1 },
						],
					},
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
					},
				},
			},
		],
	},
};
const returnSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { bar: 0 }, dst: { foo: 0 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						tombs: [
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							{ type: "Return", id: 0, count: 1 },
						],
						affixes: [
							10,
							{
								count: 4,
								stack: [ { type: "Unforward", id: 0 } ],
							},
						],
					},
					bar: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
					},
				},
			},
		],
	},
};
const returnTwiceSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						tombs: [
							1,
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							1,
							{ type: "Return", id: 0, count: 1 },
							1,
							{ type: "Move", id: 0, count: 1 },
						],
					},
				},
			},
		],
	},
};
const returnTwiceSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						tombs: [
							1,
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							1,
							{ type: "Return", id: 0, count: 1 },
							1,
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							10,
							{
								count: 4,
								stack: [ { type: "Forward", id: 0 } ],
							},
						],
					},
				},
			},
		],
	},
};
const returnTwiceSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
					},
					bar: {
						tombs: [
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							{ type: "Return", id: 0, count: 1 },
						],
					},
				},
			},
		],
	},
};
const returnTwiceSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: {
		nodes: [
			{
				modify: {
					foo: {
						nodes: [
							{ type: "Move", id: 0, count: 1 },
						],
						affixes: [
							10,
							{
								count: 4,
								stack: [ { type: "Forward", id: 0 } ],
							},
						],
					},
					bar: {
						tombs: [
							{ count: 1, seq, id: 0 },
						],
						nodes: [
							{ type: "Return", id: 0, count: 1 },
						],
					},
				},
			},
		],
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
			it("Across traits", () => {
				const actual = testInvert(moveSetAcrossTraits);
				assert.deepEqual(actual, returnSetAcrossTraits);
			});
		});
		describe("For slice ranges", () => {
			describe("For set ranges", () => {
				it("Within traits", () => {
					const actual = testInvert(moveSliceInTrait);
					assert.deepEqual(actual, returnSliceInTrait);
				});
				it("Across traits", () => {
					const actual = testInvert(moveSliceAcrossTraits);
					assert.deepEqual(actual, returnSliceAcrossTraits);
				});
			});
		});
	});

	describe("[Return MoveOut] -> [MoveOut Return]", () => {
		describe("For set ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnSetInTrait);
				assert.deepEqual(actual, returnTwiceSetInTrait);
			});
			it("Across traits", () => {
				const actual = testInvert(returnSetAcrossTraits);
				assert.deepEqual(actual, returnTwiceSetAcrossTraits);
			});
		});
		describe("For slice ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnSliceInTrait);
				assert.deepEqual(actual, returnTwiceSliceInTrait);
			});
			it("Across traits", () => {
				const actual = testInvert(returnSliceAcrossTraits);
				assert.deepEqual(actual, returnTwiceSliceAcrossTraits);
			});
		});
	});

	describe("[MoveOut Return] -> [Return MoveOut]", () => {
		describe("For set ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnTwiceSetInTrait);
				assert.deepEqual(actual, returnSetInTrait);
			});
			it("Across traits", () => {
				const actual = testInvert(returnTwiceSetAcrossTraits);
				assert.deepEqual(actual, returnSetAcrossTraits);
			});
		});
		describe("For slice ranges", () => {
			it("Within traits", () => {
				const actual = testInvert(returnTwiceSliceInTrait);
				assert.deepEqual(actual, returnSliceInTrait);
			});
			it("Across traits", () => {
				const actual = testInvert(returnTwiceSliceAcrossTraits);
				assert.deepEqual(actual, returnSliceAcrossTraits);
			});
		});
	});
});
