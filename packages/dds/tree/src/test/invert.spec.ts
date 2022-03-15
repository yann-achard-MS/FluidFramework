/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	Rebased as R,
	SeqNumber,
} from "../format";
import { invert } from "../invert";
import { deepFreeze } from "./utils";

function testInvert(frame: R.ChangeFrame, seq: SeqNumber = 0): R.ChangeFrame {
	deepFreeze(frame);
	return invert(frame, seq);
}

describe(invert.name, () => {
	it("The lot", () => {
		const seq = 42;
		const setValue: R.SetValue = { type: "SetValue", value: 1 };
		const revertValue: R.RevertValue = { type: "RevertValue", seq: 42 };
		const actual = testInvert({
			moves: [
				{ src: "foo.0.foo.4", dst: "bar.0" },
				{ src: "foo.1", dst: "baz.1" },
			],
			marks: [{
				value: 1,
				modify: {
					foo: [
						{
							type: "Delete",
							mods: [{ modify: {
								foo: [
									4,
									{
										type: "MoveOut",
										op: 0,
										length: 2,
									},
								],
							} }],
						},
						{
							type: "MoveOutStart",
							op: 1,
						},
						4,
						{
							type: "PriorDetach",
							seq: 41,
						},
						{
							type: "End",
							op: 1,
						},
						{
							type: "DeleteStart",
							op: -1,
						},
						1,
						{
							type: "PriorDetach",
							seq: 41,
						},
						1,
						{
							type: "End",
							op: -1,
						},
						1,
						{
							type: "Insert",
							content: [{ id: "X" }],
						},
					],
					bar: [
						{
							type: "MoveInSet",
							op: 0,
							mods: [setValue],
						},
					],
					baz: [
						1,
						{
							type: "MoveInSlice",
							op: 1,
							length: 4,
							mods: [1, { type: "SetValue", value: 1 }],
						},
						{
							type: "Return",
							seq: 41,
							op: 2,
							mods: [{ type: "SetValue", value: 1 }],
						},
						{
							type: "Revive",
							seq: 41,
							mods: [{ type: "SetValue", value: 1 }],
						},
					],
				},
			}],
		}, seq);
		const expected: R.ChangeFrame = {
			moves: [
				{ src: "bar.0", dst: "foo.0.foo.4" },
				{ src: "baz.1", dst: "foo.1" },
			],
			marks: [{
				value: { seq },
				modify: {
					foo: [
						{
							type: "Revive",
							seq,
							mods: [{ modify: {
								foo: [
									4,
									{
										type: "Return",
										seq,
										op: 0,
										length: 2,
									},
								],
							} }],
						},
						{
							type: "Return",
							length: 4,
							seq,
							op: 1,
						},
						{
							type: "PriorDetach",
							seq: 41,
						},
						{
							type: "Revive",
							seq,
						},
						{
							type: "PriorDetach",
							seq: 41,
						},
						{
							type: "Revive",
							seq,
						},
						1,
						{
							type: "Delete",
						},
					],
					bar: [
						{
							type: "MoveOut",
							op: 0,
							mods: [revertValue],
						},
					],
					baz: [
						1,
						{
							type: "MoveOutStart",
							op: 1,
						},
						1,
						revertValue,
						2,
						{
							type: "End",
							op: 1,
						},
						{
							type: "MoveOut",
							op: 2,
							mods: [revertValue],
						},
						{
							type: "Delete",
							mods: [revertValue],
						},
					],
				},
			}],
		};
		assert.deepEqual(actual, expected);
	});
});
