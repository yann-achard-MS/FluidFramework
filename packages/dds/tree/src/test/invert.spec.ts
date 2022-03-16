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
const insertFrame: R.ChangeFrame = {
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
const deleteFrame: R.ChangeFrame = {
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
const reviveFrame: R.ChangeFrame = {
	marks: [{
		modify: {
			foo: [
				{
					type: "Revive",
					seq,
				},
				{
					type: "Revive",
					seq,
					length: 3,
					mods: [
						1,
						{
							modify: {
								bar: [
									{
										type: "Revive",
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
const setValueFrame: R.ChangeFrame = {
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
const revertValueFrame: R.ChangeFrame = {
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

describe.only(invert.name, () => {
	it("Insert", () => {
		const actual = testInvert(insertFrame);
		assert.deepEqual(actual, deleteFrame);
	});

	it("Delete", () => {
		const actual = testInvert(deleteFrame);
		assert.deepEqual(actual, reviveFrame);
	});

	it("Revive", () => {
		const actual = testInvert(reviveFrame);
		assert.deepEqual(actual, deleteFrame);
	});

	it("SetValue", () => {
		const actual = testInvert(setValueFrame);
		assert.deepEqual(actual, revertValueFrame);
	});

	it("RevertValue", () => {
		const actual = testInvert(revertValueFrame);
		assert.deepEqual(actual, revertValueFrame);
	});
});
