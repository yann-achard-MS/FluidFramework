/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../../domains";
import { SequenceField as SF, singleTextCursor } from "../../../feature-libraries";
import { deepFreeze } from "../../utils";

const nodeX = { type: jsonString.name, value: "X" };
const nodeY = { type: jsonString.name, value: "Y" };
const content = [singleTextCursor(nodeX), singleTextCursor(nodeY)];
deepFreeze(content);

describe("SequenceField - Editor", () => {
	it("insert one node", () => {
		const actual = SF.sequenceFieldEditor.insert(42, content[0]);
		const expected: SF.Changeset = [42, { type: "Insert", content: [nodeX] }];
		assert.deepEqual(actual, expected);
	});

	it("insert multiple nodes", () => {
		const actual = SF.sequenceFieldEditor.insert(42, content);
		const expected: SF.Changeset = [42, { type: "Insert", content: [nodeX, nodeY] }];
		assert.deepEqual(actual, expected);
	});

	it("delete", () => {
		const actual = SF.sequenceFieldEditor.delete(42, 3);
		const expected: SF.Changeset = [42, { type: "Delete", count: 3 }];
		assert.deepEqual(actual, expected);
	});
});
