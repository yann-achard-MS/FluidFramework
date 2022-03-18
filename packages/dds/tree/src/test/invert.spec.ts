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
	marks: [{
		modify: {
			foo: [
				{
					type: "Insert",
					content: [{ id: "A" }],
				},
				{
					type: "Insert",
					content: [{ id: "B" }, { id: "C" }, { id: "D" }],
					mods: [
						1,
						{
							modify: {
								bar: [
									{
										type: "Insert",
										content: [{ id: "C2" }],
									},
								],
							},
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
					type: "Delete",
				},
				{
					type: "Delete",
					length: 3,
					mods: [
						1,
						{
							modify: {
								bar: [
									{
										type: "Delete",
									},
								],
							},
						},
					],
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
					type: "DeleteStart",
					op: -1,
				},
				1,
				{
					type: "End",
					op: -1,
				},
				{
					type: "DeleteStart",
					op: -2,
				},
				1,
				{
					modify: {
						bar: [
							{
								type: "DeleteStart",
								op: -3,
							},
							1,
							{
								type: "End",
								op: -3,
							},
						],
					},
				},
				1,
				{
					type: "End",
					op: -2,
				},
			],
		},
	}],
};
const revive: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "ReviveSet",
					seq,
				},
				{
					type: "ReviveSet",
					seq,
					length: 3,
					mods: [
						1,
						{
							modify: {
								bar: [
									{
										type: "ReviveSet",
										seq,
									},
								],
							},
						},
					],
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
					type: "ReviveSlice",
					seq,
					op: -1,
				},
				{
					type: "ReviveSlice",
					seq,
					op: -2,
					length: 3,
					mods: [
						1,
						{
							modify: {
								bar: [
									{
										type: "ReviveSlice",
										seq,
										op: -3,
									},
								],
							},
						},
					],
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
		{ src: "foo.2", dst: "foo.1" },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveInSet",
						op: 0,
					},
					1,
					{
						type: "MoveOut",
						op: 0,
					},
				],
			},
		},
	],
};
const moveSliceInTrait: R.ChangeFrame = {
	moves: [
		{ src: "foo.2", dst: "foo.1" },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveInSlice",
						op: 0,
					},
					1,
					{
						type: "MoveOutStart",
						op: 0,
					},
					1,
					{
						type: "End",
						op: 0,
					},
				],
			},
		},
	],
};
const moveSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ src: "foo.0", dst: "bar.0" },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOut",
						op: 0,
					},
				],
				bar: [
					{
						type: "MoveInSet",
						op: 0,
					},
				],
			},
		},
	],
};
const moveSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ src: "foo.0", dst: "bar.0" },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOutStart",
						op: 0,
					},
					1,
					{
						type: "End",
						op: 0,
					},
				],
				bar: [
					{
						type: "MoveInSlice",
						op: 0,
					},
				],
			},
		},
	],
};
const returnSetInTrait: R.ChangeFrame = {
	moves: [
		{ src: "foo.1", dst: "foo.2" },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveOut",
						op: 0,
					},
					1,
					{
						type: "ReturnSet",
						op: 0,
						seq,
					},
				],
			},
		},
	],
};
const returnSliceInTrait: R.ChangeFrame = {
	moves: [
		{ src: "foo.1", dst: "foo.2" },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "MoveOutStart",
						op: 0,
					},
					1,
					{
						type: "End",
						op: 0,
					},
					1,
					{
						type: "ReturnSlice",
						op: 0,
						seq,
					},
				],
			},
		},
	],
};
const returnSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ src: "bar.0", dst: "foo.0" },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "ReturnSet",
						seq,
						op: 0,
					},
				],
				bar: [
					{
						type: "MoveOut",
						op: 0,
					},
				],
			},
		},
	],
};
const returnSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ src: "bar.0", dst: "foo.0" },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "ReturnSlice",
						seq,
						op: 0,
					},
				],
				bar: [
					{
						type: "MoveOutStart",
						op: 0,
					},
					1,
					{
						type: "End",
						op: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSetInTrait: R.ChangeFrame = {
	moves: [
		{ src: "foo.2", dst: "foo.1" },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "ReturnSet",
						op: 0,
						seq,
					},
					1,
					{
						type: "MoveOut",
						op: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSliceInTrait: R.ChangeFrame = {
	moves: [
		{ src: "foo.2", dst: "foo.1" },
	],
	marks: [
		{
			modify: {
				foo: [
					1,
					{
						type: "ReturnSlice",
						op: 0,
						seq,
					},
					1,
					{
						type: "MoveOutStart",
						op: 0,
					},
					1,
					{
						type: "End",
						op: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSetAcrossTraits: R.ChangeFrame = {
	moves: [
		{ src: "foo.0", dst: "bar.0" },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOut",
						op: 0,
					},
				],
				bar: [
					{
						type: "ReturnSet",
						seq,
						op: 0,
					},
				],
			},
		},
	],
};
const returnTwiceSliceAcrossTraits: R.ChangeFrame = {
	moves: [
		{ src: "foo.0", dst: "bar.0" },
	],
	marks: [
		{
			modify: {
				foo: [
					{
						type: "MoveOutStart",
						op: 0,
					},
					1,
					{
						type: "End",
						op: 0,
					},
				],
				bar: [
					{
						type: "ReturnSlice",
						seq,
						op: 0,
					},
				],
			},
		},
	],
};

describe.only(invert.name, () => {
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
			assert.deepEqual(actual, revive);
		});
		it("For slice ranges", () => {
			const actual = testInvert(deleteSlice);
			assert.deepEqual(actual, reviveSlice);
		});
	});

	describe("Revive -> Delete", () => {
		it("For set ranges", () => {
			const actual = testInvert(revive);
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
