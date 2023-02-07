/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKinds, IdAllocator, NodeReviver, singleTextCursor } from "../../feature-libraries";
import { makeAnonChange, RevisionTag, TreeSchemaIdentifier, Delta, tagChange } from "../../core";
import { brand } from "../../util";
import { assertMarkListEqual, noRepair } from "../utils";
import { TestChange, TestChangeEncoder } from "../testChange";

const nodeType: TreeSchemaIdentifier = brand("Node");
const tree1 = { type: nodeType, value: "value1" };
const tree2 = { type: nodeType, value: "value2" };

const idAllocator: IdAllocator = () => assert.fail("Should not be called");

describe("Value field changesets", () => {
	const fieldHandler = FieldKinds.value.changeHandler;

	const change1 = fieldHandler.editor.set(singleTextCursor(tree1));
	const change2 = fieldHandler.editor.set(singleTextCursor(tree2));

	const detachedBy: RevisionTag = brand(42);
	const revertChange2: FieldKinds.ValueChangeset = {
		value: { revert: detachedBy },
	};

	it("can be created", () => {
		const expected: FieldKinds.ValueChangeset = { value: { set: tree1 } };
		assert.deepEqual(change1, expected);
	});

	it("can be composed", () => {
		const composed = fieldHandler.rebaser.compose(
			[makeAnonChange(change1), makeAnonChange(change2)],
			idAllocator,
		);

		assert.deepEqual(composed, change2);
	});

	it("can be inverted", () => {
		const inverted = fieldHandler.rebaser.invert(tagChange(change1, detachedBy), idAllocator);
		const expected: FieldKinds.ValueChangeset = { value: { revert: detachedBy } };
		assert.deepEqual(inverted, expected);
	});

	it("can be rebased", () => {
		assert.deepEqual(
			fieldHandler.rebaser.rebase(change2, makeAnonChange(change1), idAllocator),
			change2,
		);
	});

	it("can be converted to a delta when overwriting content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const delta = fieldHandler.intoDelta(change1, noRepair);
		assertMarkListEqual(delta, expected);
	});

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const repair: NodeReviver = (revision: RevisionTag, index: number, count: number) => {
			assert.equal(revision, detachedBy);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return [singleTextCursor(tree1)];
		};
		const actual = fieldHandler.intoDelta(revertChange2, repair);
		assertMarkListEqual(actual, expected);
	});

	it("can encode change in JSON", () => {
		const version = 0;
		const encoded = JSON.stringify(fieldHandler.encoder.encodeChangeForJson(version, change1));
		const decoded = fieldHandler.encoder.decodeChangeJson(version, JSON.parse(encoded));
		assert.deepEqual(decoded, change1);
	});

	it("can encode anchors in JSON", () => {
		const version = 0;
		const childEncoder = new TestChangeEncoder();
		const original = FieldKinds.value.anchorStoreFactory<TestChange>();
		original.track(fieldHandler.getKey(0), TestChange.mint([], 1));
		const encoded = JSON.stringify(
			fieldHandler.encoder.encodeAnchorSetForJson(version, original, (data) =>
				childEncoder.encodeForJson(0, data),
			),
		);
		const decoded = fieldHandler.encoder.decodeAnchorSetJson(
			version,
			JSON.parse(encoded),
			(data) => childEncoder.decodeJson(0, data),
		);
		assert.deepEqual(decoded, original);
	});
});

describe("Optional field changesets", () => {
	const fieldHandler = FieldKinds.optional.changeHandler;
	const editor = fieldHandler.editor;

	const change1: FieldKinds.OptionalChangeset = {
		fieldChange: { newContent: { set: tree1 }, wasEmpty: true },
	};

	const detachedBy: RevisionTag = brand(42);
	const revertChange2: FieldKinds.OptionalChangeset = {
		fieldChange: { newContent: { revert: detachedBy }, wasEmpty: false },
	};

	const change2: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree2), false);
	const change3: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree2), true);

	it("can be created", () => {
		const actual: FieldKinds.OptionalChangeset = editor.set(singleTextCursor(tree1), true);
		const expected: FieldKinds.OptionalChangeset = {
			fieldChange: { newContent: { set: tree1 }, wasEmpty: true },
		};
		assert.deepEqual(actual, expected);
	});

	it("can be composed", () => {
		const composed = fieldHandler.rebaser.compose(
			[makeAnonChange(change1), makeAnonChange(change2)],
			idAllocator,
		);
		assert.deepEqual(composed, change3);
	});

	it("can invert insert", () => {
		const expected: FieldKinds.OptionalChangeset = {
			fieldChange: { wasEmpty: false },
		};

		assert.deepEqual(
			fieldHandler.rebaser.invert(tagChange(change1, detachedBy), idAllocator),
			expected,
		);
	});

	it("can invert replace", () => {
		assert.deepEqual(
			fieldHandler.rebaser.invert(tagChange(change2, detachedBy), idAllocator),
			revertChange2,
		);
	});

	it("can be rebased", () => {
		assert.deepEqual(
			fieldHandler.rebaser.rebase(change3, makeAnonChange(change1), idAllocator),
			change2,
		);
	});

	it("can be converted to a delta when field was empty", () => {
		const expected: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content: [singleTextCursor(tree1)],
			},
		];

		assertMarkListEqual(fieldHandler.intoDelta(change1, noRepair), expected);
	});

	it("can be converted to a delta when replacing content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree2)] },
		];

		assertMarkListEqual(fieldHandler.intoDelta(change2, noRepair), expected);
	});

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const repair: NodeReviver = (revision: RevisionTag, index: number, count: number) => {
			assert.equal(revision, detachedBy);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return [singleTextCursor(tree1)];
		};
		const actual = fieldHandler.intoDelta(revertChange2, repair);
		assertMarkListEqual(actual, expected);
	});

	it("can encode change in JSON", () => {
		const version = 0;
		const encoded = JSON.stringify(fieldHandler.encoder.encodeChangeForJson(version, change1));
		const decoded = fieldHandler.encoder.decodeChangeJson(version, JSON.parse(encoded));
		assert.deepEqual(decoded, change1);
	});

	it("can encode anchors in JSON", () => {
		const version = 0;
		const childEncoder = new TestChangeEncoder();
		const original = FieldKinds.optional.anchorStoreFactory<TestChange>();
		original.track(fieldHandler.getKey(0), TestChange.mint([], 1));
		const encoded = JSON.stringify(
			fieldHandler.encoder.encodeAnchorSetForJson(version, original, (data) =>
				childEncoder.encodeForJson(0, data),
			),
		);
		const decoded = fieldHandler.encoder.decodeAnchorSetJson(
			version,
			JSON.parse(encoded),
			(data) => childEncoder.decodeJson(0, data),
		);
		assert.deepEqual(decoded, original);
	});
});
