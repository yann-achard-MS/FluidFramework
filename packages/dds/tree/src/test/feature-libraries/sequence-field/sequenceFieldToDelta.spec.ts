/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	makeAnonChange,
	RevisionTag,
	Delta,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
} from "../../../core";
import {
	ChangesetLocalId,
	NodeReviver,
	SequenceField as SF,
	singleTextCursor,
} from "../../../feature-libraries";
import { brand, brandOpaque, makeArray } from "../../../util";
import { assertMarkListEqual, deepFreeze } from "../../utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";
import { composeAnonChanges, idAllocatorFromMaxId } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const nodeX = { type, value: 0 };
const content = [nodeX];
const contentCursor: ITreeCursorSynchronous[] = [singleTextCursor(nodeX)];
const moveId = brand<ChangesetLocalId>(4242);
const tag: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);
const deltaMoveId = brandOpaque<Delta.MoveId>(moveId);

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("DummyRevivedNode");

function fakeRepairData(_revision: RevisionTag, _index: number, count: number): Delta.ProtoNode[] {
	return makeArray(count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE }));
}

function toDelta(change: TestChangeset, reviver: NodeReviver = fakeRepairData): Delta.MarkList {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(change, reviver);
}

describe("SequenceField - toDelta", () => {
	it("empty mark list", () => {
		const actual = toDelta([]);
		assert.deepEqual(actual, []);
	});

	it("insert", () => {
		const changeset = Change.insert(0, 1);
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: contentCursor,
		};
		const expected: Delta.MarkList = [mark];
		const actual = toDelta(changeset);
		assertMarkListEqual(actual, expected);
	});

	it("revive => insert", () => {
		const changeset = Change.revive(0, 1, tag, 0);
		function reviver(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] {
			assert.equal(revision, tag);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return contentCursor;
		}
		const actual = toDelta(changeset, reviver);
		const expected: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content: contentCursor,
			},
		];
		assertMarkListEqual(actual, expected);
	});

	it("conflicted revive => skip", () => {
		const changeset: TestChangeset = composeAnonChanges([
			Change.revive(0, 1, tag, 0, tag2),
			Change.delete(1, 1),
		]);
		const actual = toDelta(changeset);
		const expected: Delta.MarkList = [1, { type: Delta.MarkType.Delete, count: 1 }];
		assertMarkListEqual(actual, expected);
	});

	it("blocked revive => nil", () => {
		const changeset: TestChangeset = composeAnonChanges([
			Change.revive(0, 1, tag, 0, tag2, undefined, tag3),
			Change.delete(1, 1),
		]);
		const actual = toDelta(changeset);
		const expected: Delta.MarkList = [1, { type: Delta.MarkType.Delete, count: 1 }];
		assertMarkListEqual(actual, expected);
	});

	it("delete", () => {
		const changeset = Change.delete(0, 10);
		const mark: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 10,
		};
		const expected: Delta.MarkList = [mark];
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});

	it("move", () => {
		const changeset: TestChangeset = [
			42,
			{
				type: "MoveOut",
				id: moveId,
				count: 10,
			},
			8,
			{
				type: "MoveIn",
				id: moveId,
				count: 10,
			},
		];
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			moveId: deltaMoveId,
			count: 10,
		};
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			moveId: deltaMoveId,
			count: 10,
		};
		const expected: Delta.MarkList = [42, moveOut, 8, moveIn];
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});

	it("multiple changes", () => {
		const changeset = SF.sequenceFieldChangeRebaser.compose(
			[makeAnonChange(Change.delete(0, 10)), makeAnonChange(Change.insert(3, 1))],
			idAllocatorFromMaxId(),
		);
		const del: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 10,
		};
		const ins: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: contentCursor,
		};
		const expected: Delta.MarkList = [del, 3, ins];
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});
});
