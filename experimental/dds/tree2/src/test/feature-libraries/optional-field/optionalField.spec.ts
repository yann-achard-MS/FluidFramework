/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CrossFieldManager, NodeChangeset } from "../../../feature-libraries";
import {
	makeAnonChange,
	TaggedChange,
	Delta,
	mintRevisionTag,
	tagChange,
	makeDetachedNodeId,
	FieldKey,
} from "../../../core";
import { brand, fakeIdAllocator } from "../../../util";
import { assertFieldChangesEqual, defaultRevisionMetadataFromChanges } from "../../utils";
import {
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	OptionalChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/optional-field";
import { changesetForChild, fooKey, testTree, testTreeCursor } from "../fieldKindTestUtils";

/**
 * A change to a child encoding as a simple placeholder string.
 * This change has no actual meaning, and can be used in tests where the type of child change in not relevant.
 */
const arbitraryChildChange = changesetForChild("arbitraryChildChange");

const nodeChange1 = changesetForChild("nodeChange1");
const nodeChange2 = changesetForChild("nodeChange2");

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should query CrossFieldManager"),
	set: () => assert.fail("Should modify CrossFieldManager"),
};

const deltaFromChild1 = ({ change, revision }: TaggedChange<NodeChangeset>): Delta.FieldMap => {
	assert.deepEqual(change, nodeChange1);
	const buildId = makeDetachedNodeId(revision, 1);
	return new Map<FieldKey, Delta.FieldChanges>([
		[
			fooKey,
			{
				build: [{ id: buildId, trees: [testTreeCursor("nodeChange1")] }],
				local: [
					{
						count: 1,
						detach: makeDetachedNodeId(revision, 0),
						attach: buildId,
					},
				],
			},
		],
	]);
};

const deltaFromChild2 = ({ change, revision }: TaggedChange<NodeChangeset>): Delta.FieldMap => {
	assert.deepEqual(change, nodeChange2);
	const buildId = makeDetachedNodeId(revision, 1);
	return new Map<FieldKey, Delta.FieldChanges>([
		[
			fooKey,
			{
				build: [{ id: buildId, trees: [testTreeCursor("nodeChange2")] }],
				local: [
					{
						count: 1,
						detach: makeDetachedNodeId(revision, 0),
						attach: buildId,
					},
				],
			},
		],
	]);
};

const tag = mintRevisionTag();
const change1: TaggedChange<OptionalChangeset> = tagChange(
	{
		fieldChange: {
			id: brand(1),
			newContent: {
				set: testTree("tree1"),
				changes: nodeChange1,
				buildId: { localId: brand(41) },
			},
			wasEmpty: true,
		},
	},
	tag,
);

const change2: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), false, brand(2), brand(42)),
	mintRevisionTag(),
);

const revertChange2: TaggedChange<OptionalChangeset> = tagChange(
	{
		fieldChange: {
			id: brand(2),
			newContent: {
				revert: { revision: change2.revision, localId: brand(2) },
			},
			wasEmpty: false,
		},
	},
	mintRevisionTag(),
);

/**
 * Represents what change2 would have been had it been concurrent with change1.
 */
const change2PreChange1: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), true, brand(2), brand(42)),
	change2.revision,
);

// TODO: unit test standalone functions from optionalField.ts
describe("optionalField", () => {
	// TODO: more editor tests
	describe("editor", () => {
		it("can be created", () => {
			const actual: OptionalChangeset = optionalFieldEditor.set(
				testTreeCursor("x"),
				true,
				brand(42),
				brand(43),
			);
			const expected: OptionalChangeset = {
				fieldChange: {
					id: brand(42),
					newContent: { set: testTree("x"), buildId: { localId: brand(43) } },
					wasEmpty: true,
				},
			};
			assert.deepEqual(actual, expected);
		});
	});

	describe("optionalChangeRebaser", () => {
		it("can be composed", () => {
			const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
				assert.equal(changes.length, 1);
				return changes[0].change;
			};
			const composed = optionalChangeRebaser.compose(
				[change1, change2],
				simpleChildComposer,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change2]),
			);

			const change1And2: OptionalChangeset = {
				fieldChange: {
					id: brand(2),
					revision: change2.revision,
					newContent: { set: testTree("tree2"), buildId: { localId: brand(42) } },
					wasEmpty: true,
				},
				childChanges: [[{ revision: change2.revision, localId: brand(2) }, nodeChange1]],
			};

			assert.deepEqual(composed, change1And2);
		});

		it("can be inverted", () => {
			const childInverter = (change: NodeChangeset) => {
				assert.deepEqual(change, nodeChange1);
				return nodeChange2;
			};

			const expected: OptionalChangeset = {
				fieldChange: { id: brand(1), wasEmpty: false },
				childChanges: [["self", nodeChange2]],
			};

			assert.deepEqual(
				optionalChangeRebaser.invert(
					change1,
					childInverter,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1]),
				),
				expected,
			);
		});

		describe("Rebasing", () => {
			it("can be rebased", () => {
				const childRebaser = (
					_change: NodeChangeset | undefined,
					_base: NodeChangeset | undefined,
				) => assert.fail("Should not be called");
				assert.deepEqual(
					optionalChangeRebaser.rebase(
						change2PreChange1.change,
						change1,
						childRebaser,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([change1]),
					),
					change2.change,
				);
			});

			it("can rebase child change", () => {
				const baseChange: OptionalChangeset = { childChanges: [["self", nodeChange1]] };
				const changeToRebase: OptionalChangeset = { childChanges: [["self", nodeChange2]] };

				const childRebaser = (
					change: NodeChangeset | undefined,
					base: NodeChangeset | undefined,
				): NodeChangeset | undefined => {
					assert.deepEqual(change, nodeChange2);
					assert.deepEqual(base, nodeChange1);
					return arbitraryChildChange;
				};

				const expected: OptionalChangeset = {
					childChanges: [["self", arbitraryChildChange]],
				};

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						makeAnonChange(baseChange),
						childRebaser,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([]),
					),
					expected,
				);
			});

			it("can rebase child change (field change ↷ field change)", () => {
				const baseChange: OptionalChangeset = {
					fieldChange: {
						id: brand(0),
						wasEmpty: false,
					},
					childChanges: [["self", nodeChange1]],
				};
				const changeToRebase: OptionalChangeset = {
					fieldChange: {
						id: brand(1),
						wasEmpty: false,
						newContent: {
							set: { type: brand("value"), value: "X" },
							buildId: { localId: brand(41) },
						},
					},
					childChanges: [["self", nodeChange2]],
				};

				const childRebaser = (
					change: NodeChangeset | undefined,
					base: NodeChangeset | undefined,
				): NodeChangeset | undefined => {
					assert.deepEqual(change, nodeChange2);
					assert.deepEqual(base, nodeChange1);
					return arbitraryChildChange;
				};

				const expected: OptionalChangeset = {
					fieldChange: {
						id: brand(1),
						wasEmpty: true,
						newContent: {
							set: { type: brand("value"), value: "X" },
							buildId: { localId: brand(41) },
						},
					},
					childChanges: [[{ localId: brand(0) }, arbitraryChildChange]],
				};

				const actual = optionalChangeRebaser.rebase(
					changeToRebase,
					makeAnonChange(baseChange),
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([]),
				);
				assert.deepEqual(actual, expected);
			});
		});
	});

	describe("optionalFieldIntoDelta", () => {
		it("can be converted to a delta when field was empty", () => {
			const outerNodeId = makeDetachedNodeId(tag, 41);
			const innerNodeId = makeDetachedNodeId(tag, 1);
			const expected: Delta.FieldChanges = {
				build: [{ id: outerNodeId, trees: [testTreeCursor("tree1")] }],
				global: [
					{
						id: outerNodeId,
						fields: new Map<FieldKey, Delta.FieldChanges>([
							[
								fooKey,
								{
									build: [
										{
											id: innerNodeId,
											trees: [testTreeCursor("nodeChange1")],
										},
									],
									local: [
										{
											count: 1,
											attach: innerNodeId,
											detach: { major: tag, minor: 0 },
										},
									],
								},
							],
						]),
					},
				],
				local: [{ count: 1, attach: outerNodeId }],
			};

			const actual = optionalFieldIntoDelta(change1, (change) =>
				deltaFromChild1(tagChange(change, tag)),
			);
			assertFieldChangesEqual(actual, expected);
		});

		it("can be converted to a delta when restoring content", () => {
			const expected: Delta.FieldChanges = {
				local: [
					{
						count: 1,
						attach: { major: change2.revision, minor: 2 },
						detach: { major: revertChange2.revision, minor: 2 },
					},
				],
			};

			const actual = optionalFieldIntoDelta(revertChange2, (change) =>
				deltaFromChild1(tagChange(change, revertChange2.revision)),
			);
			assertFieldChangesEqual(actual, expected);
		});
	});
});
