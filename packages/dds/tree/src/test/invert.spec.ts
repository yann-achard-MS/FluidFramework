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

// const setValue: R.SetValue = { type: "SetValue", value: 1 };

describe.only(invert.name, () => {
	it("Insert", () => {
		const seq = 42;
		const actual = testInvert({
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
		}, seq);
		const expected: R.ChangeFrame = {
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
		assert.deepEqual(actual, expected);
	});
});
