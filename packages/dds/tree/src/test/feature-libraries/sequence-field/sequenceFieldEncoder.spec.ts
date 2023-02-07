/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { TestChange, TestChangeEncoder } from "../../testChange";
import { deepFreeze } from "../../utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";

const encoder = SF.sequenceFieldChangeEncoder;

describe("SequenceField - Encoder", () => {
	it("AnchorSet", () => {
		const original = SF.anchorSetFactory<TestChange>();
		original.track(SF.sequenceFieldChangeHandler.getKey(42), TestChange.mint([], 1));
		deepFreeze(original);
		const childEncoder = new TestChangeEncoder();
		const encoded = JSON.stringify(
			encoder.encodeAnchorSetForJson(0, original, (c) => childEncoder.encodeForJson(0, c)),
		);
		const decoded = encoder.decodeAnchorSetJson(0, JSON.parse(encoded), (c) =>
			childEncoder.decodeJson(0, c),
		);
		assert.deepEqual(decoded, original);
	});

	it("Change", () => {
		const change: TestChangeset = Change.delete(2, 2);
		deepFreeze(change);
		const encoded = JSON.stringify(encoder.encodeChangeForJson(0, change));
		const decoded = encoder.decodeChangeJson(0, JSON.parse(encoded));
		assert.deepEqual(decoded, change);
	});
});
