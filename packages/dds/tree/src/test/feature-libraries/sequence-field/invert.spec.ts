/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { RevisionTag, tagChange } from "../../../core";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { composeAnonChanges } from "./utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";

function invert(change: TestChangeset): TestChangeset {
	deepFreeze(change);
	return SF.invert(tagChange(change, tag));
}

const tag: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);

describe("SequenceField - Invert", () => {
	it("no changes", () => {
		const input: SF.Changeset = [];
		const expected: SF.Changeset = [];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("insert => delete", () => {
		const input = Change.insert(0, 2);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("modified insert => delete", () => {
		const insert = Change.insert(0, 1);
		const modify = Change.modify(0, TestChange.mint([], 42));
		const input = composeAnonChanges([insert, modify]);
		const expected = Change.delete(0, 1);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive", () => {
		const input = Change.delete(0, 2);
		const expected = Change.revive(0, 2, tag, 0);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("revert-only active revive => delete", () => {
		const revive = Change.revive(0, 2, tag, 0);
		const modify = Change.modify(0, TestChange.mint([], 42));
		const input = composeAnonChanges([revive, modify]);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("revert-only conflicted revive => skip", () => {
		const input: TestChangeset = [
			{
				type: "Delete",
				count: 1,
			},
			{
				type: "Revive",
				count: 1,
				detachedBy: tag,
				detachIndex: 0,
				conflictsWith: tag2,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const expected = composeAnonChanges([Change.revive(0, 1, tag), Change.revive(2, 1, tag)]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("revert-only blocked revive => no-op", () => {
		const input: TestChangeset = [
			{
				type: "Delete",
				count: 1,
			},
			{
				type: "Revive",
				count: 1,
				detachedBy: tag,
				detachIndex: 0,
				conflictsWith: tag2,
				lastDetachedBy: tag3,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const expected = composeAnonChanges([Change.revive(0, 1, tag), Change.revive(1, 1, tag)]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("intentional active revive => delete", () => {
		const input = Change.intentionalRevive(0, 2, tag, 0);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("intentional conflicted revive => skip", () => {
		const input = composeAnonChanges([
			Change.delete(0, 1),
			Change.intentionalRevive(0, 2, tag, 0, tag2),
			Change.delete(2, 1),
		]);
		const expected = composeAnonChanges([Change.revive(0, 1, tag), Change.revive(2, 1, tag)]);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move => return", () => {
		const input = Change.move(0, 2, 3);
		const expected = Change.return(3, 2, 0, tag);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move backward => return", () => {
		const input = Change.move(2, 2, 0);
		const expected = Change.return(0, 2, 2, tag);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("return => return", () => {
		const input = Change.return(0, 2, 3, brand(41));
		const expected = Change.return(3, 2, 0, tag);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("conflicted-move out + move-in => nil + nil", () => {
		const input: TestChangeset = [
			{
				type: "MoveOut",
				count: 1,
				id: brand(0),
				conflictsWith: tag,
			},
			{
				type: "MoveIn",
				count: 1,
				id: brand(0),
				isSrcConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = Change.revive(0, 1, tag);
		assert.deepEqual(actual, expected);
	});

	it("conflicted return-from + return-to => nil + nil", () => {
		const input: TestChangeset = [
			{
				type: "ReturnFrom",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				conflictsWith: tag,
			},
			{
				type: "ReturnTo",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				detachIndex: 0,
				isSrcConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = Change.revive(0, 1, tag);
		assert.deepEqual(actual, expected);
	});

	it("move-out + conflicted move-in => skip + skip", () => {
		const input: TestChangeset = [
			{
				type: "MoveOut",
				count: 1,
				id: brand(0),
				isDstConflicted: true,
			},
			{
				type: "MoveIn",
				count: 1,
				id: brand(0),
				conflictsWith: tag,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = Change.revive(1, 1, tag);
		assert.deepEqual(actual, expected);
	});

	it("return-from + conflicted return-to => skip + skip", () => {
		const input: TestChangeset = [
			{
				type: "ReturnFrom",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				isDstConflicted: true,
			},
			{
				type: "ReturnTo",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				detachIndex: 0,
				conflictsWith: tag,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = Change.revive(2, 1, tag);
		assert.deepEqual(actual, expected);
	});

	it("conflicted move-out + conflicted move-in => nil + skip", () => {
		const input: TestChangeset = [
			{
				type: "MoveOut",
				count: 1,
				id: brand(0),
				conflictsWith: tag,
				isDstConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
			{
				type: "MoveIn",
				count: 1,
				id: brand(0),
				conflictsWith: tag,
				isSrcConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = composeAnonChanges([Change.revive(0, 1, tag), Change.revive(1, 1, tag)]);
		assert.deepEqual(actual, expected);
	});

	it("conflicted return-from + conflicted return-to => nil + skip", () => {
		const input: TestChangeset = [
			{
				type: "ReturnFrom",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				conflictsWith: tag,
				isDstConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
			{
				type: "ReturnTo",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				detachIndex: 0,
				conflictsWith: tag,
				isSrcConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = composeAnonChanges([Change.revive(0, 1, tag), Change.revive(2, 1, tag)]);
		assert.deepEqual(actual, expected);
	});

	it("return-from + blocked return-to => skip + nil", () => {
		const input: TestChangeset = [
			{
				type: "ReturnFrom",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				isDstConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
			{
				type: "ReturnTo",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				detachIndex: 0,
				conflictsWith: tag,
				lastDetachedBy: tag3,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = composeAnonChanges([Change.revive(1, 1, tag), Change.revive(2, 1, tag)]);
		assert.deepEqual(actual, expected);
	});

	it("conflicted return-from + blocked return-to => nil + nil", () => {
		const input: TestChangeset = [
			{
				type: "ReturnFrom",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				conflictsWith: tag,
				isDstConflicted: true,
			},
			{
				type: "ReturnTo",
				count: 1,
				id: brand(0),
				detachedBy: tag2,
				detachIndex: 0,
				conflictsWith: tag,
				lastDetachedBy: tag3,
				isSrcConflicted: true,
			},
			{
				type: "Delete",
				count: 1,
			},
		];
		const actual = invert(input);
		const expected = Change.revive(0, 1, tag);
		assert.deepEqual(actual, expected);
	});
});
