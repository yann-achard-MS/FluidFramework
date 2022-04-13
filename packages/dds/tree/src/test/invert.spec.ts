/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
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
const priorSeq = seq;

const insert: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "Insert",
					id: 0,
					content: [{ id: "A" }],
				},
				{
					type: "Insert",
					id: 1,
					content: [{ id: "B" }, { id: "C" }, { id: "E" }],
					mods: [
						1,
						{
							modify: {
								bar: [
									{
										type: "Insert",
										id: 2,
										content: [{ id: "CA" }],
									},
								],
							},
						},
						{
							type: "Insert",
							id: 3,
							content: [{ id: "D" }],
						},
					],
				},
			],
		},
	}],
};
const deleteSet: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "DeleteSet",
					id: -0,
				},
				{
					type: "DeleteSet",
					id: -1,
					length: 4,
				},
			],
		},
	}],
};
const deleteSlice: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "DeleteSlice",
					id: 0,
				},
				{
					type: "DeleteSlice",
					id: 1,
					length: 3,
				},
			],
		},
	}],
};
const reviveSet: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "Revive",
					range: RangeType.Set,
					priorSeq,
					priorId: -0,
					id: 0,
				},
				{
					type: "Revive",
					range: RangeType.Set,
					priorSeq,
					priorId: -1,
					id: 1,
					length: 4,
				},
			],
		},
	}],
};
const reviveSlice: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "Revive",
					range: RangeType.Slice,
					priorSeq,
					priorId: 0,
					id: -0,
				},
				{
					type: "Revive",
					range: RangeType.Slice,
					priorSeq,
					priorId: 1,
					id: -1,
					length: 3,
				},
			],
		},
	}],
};
const setValue: R.ChangeFrame = {
	marks: [{
		value: 1,
		modify: {
			foo: [
				{
					type: "SetValue",
					value: 1,
				},
			],
		},
	}],
};
const revertValue: R.ChangeFrame = {
	marks: [{
		value: { seq },
		modify: {
			foo: [
				{
					type: "RevertValue",
					seq,
				},
			],
		},
	}],
};
const moveSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveIn",
						range: RangeType.Set,
						id: 0,
					},
					1,
					{
						type: "MoveOutSet",
						id: 0,
					},
				],
			},
		},
	],
};
const moveSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveIn",
						range: RangeType.Slice,
						id: 0,
					},
					1,
					{
						type: "MoveOutSlice",
						id: 0,
					},
				],
			},
		},
	],
};
const moveSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOutSet",
						id: 0,
					},
				],
				bar: [
					{
						type: "MoveIn",
						range: RangeType.Set,
						id: 0,
					},
				],
			},
		},
	],
};
const moveSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOutSlice",
						id: 0,
					},
				],
				bar: [
					{
						type: "MoveIn",
						range: RangeType.Slice,
						id: 0,
					},
				],
			},
		},
	],
};
const returnSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveOutSet",
						id: -0,
					},
					1,
					{
						type: "Return",
						range: RangeType.Set,
						id: -0,
						priorSeq,
						priorId: 0,
					},
				],
			},
		},
	],
};
const returnSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 1 }, dst: { foo: 2 } },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveOutSlice",
						id: -0,
					},
					1,
					{
						type: "Return",
						range: RangeType.Slice,
						id: -0,
						priorSeq,
						priorId: 0,
					},
				],
			},
		},
	],
};
const returnSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { bar: 0 }, dst: { foo: 0 } },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "Return",
						range: RangeType.Set,
						priorSeq,
						priorId: 0,
						id: -0,
					},
				],
				bar: [
					{
						type: "MoveOutSet",
						id: -0,
					},
				],
			},
		},
	],
};
const returnSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { bar: 0 }, dst: { foo: 0 } },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "Return",
						range: RangeType.Slice,
						priorSeq,
						priorId: 0,
						id: -0,
					},
				],
				bar: [
					{
						type: "MoveOutSlice",
						id: -0,
					},
				],
			},
		},
	],
};
const returnTwiceSetInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "Return",
						range: RangeType.Set,
						id: 0,
						priorSeq,
						priorId: -0,
					},
					1,
					{
						type: "MoveOutSet",
						id: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSliceInTrait: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 2 }, dst: { foo: 1 } },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "Return",
						range: RangeType.Slice,
						id: 0,
						priorSeq,
						priorId: -0,
					},
					1,
					{
						type: "MoveOutSlice",
						id: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOutSet",
						id: 0,
					},
				],
				bar: [
					{
						type: "Return",
						range: RangeType.Set,
						priorSeq,
						priorId: -0,
						id: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ id: 0, src: { foo: 0 }, dst: { bar: 0 } },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOutSlice",
						id: 0,
					},
				],
				bar: [
					{
						type: "Return",
						range: RangeType.Slice,
						priorSeq,
						priorId: -0,
						id: 0,
					},
				],
			},
		},
	],
};

describe(invert.name, () => {
	it("SetValue -> RevertValue", () => {
		const actual = testInvert(setValue);
		assert.deepEqual(actual, revertValue);
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
