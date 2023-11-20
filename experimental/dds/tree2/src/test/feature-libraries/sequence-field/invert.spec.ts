/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ChangeAtomId,
	ChangesetLocalId,
	mintRevisionTag,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
} from "../../../core";
import { deepFreeze } from "../../utils";
import { brand } from "../../../util";
import { invert as invertChange } from "./utils";
import { ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";

function invert(change: TestChangeset, tag?: RevisionTag): TestChangeset {
	deepFreeze(change);
	return invertChange(tagChange(change, tag ?? tag1));
}

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

describe("SequenceField - Invert", () => {
	it("no changes", () => {
		const input: TestChangeset = [];
		const expected: TestChangeset = [];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("insert => delete", () => {
		const input = Change.insert(0, 2);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive", () => {
		const input = [Mark.delete(1, brand(0))];
		const expected = [Mark.revive(1, { revision: tag1, localId: brand(0) })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive (with rollback ID)", () => {
		const detachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const input = tagRollbackInverse([Mark.delete(2, brand(0))], tag1, tag2);
		const expected = [Mark.revive(2, detachId)];
		const actual = invertChange(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive (with override ID)", () => {
		const detachIdOverride: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const input: TestChangeset = [Mark.delete(2, brand(5), { detachIdOverride })];
		const expected = [Mark.revive(2, detachIdOverride, { id: brand(5) })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("active revive => delete", () => {
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const input = Change.revive(0, 2, cellId);
		const expected: TestChangeset = [Mark.delete(2, brand(0), { detachIdOverride: cellId })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move => return", () => {
		const input = Change.move(0, 2, 5);
		const expected = Change.return(3, 2, 0, { revision: tag1, localId: brand(0) });
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move backward => return", () => {
		const input = Change.move(2, 2, 0);
		const expected = Change.return(0, 2, 4, { revision: tag1, localId: brand(0) });
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("return => return", () => {
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const input = Change.return(0, 2, 5, cellId);

		const expected: TestChangeset = [
			Mark.returnTo(2, brand(0), cellId),
			{ count: 3 },
			Mark.returnFrom(2, brand(0), {
				detachIdOverride: { revision: tag1, localId: brand(1) },
			}),
		];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("pin live nodes => skip", () => {
		const input = [Mark.pin(1, brand(0))];
		const expected: TestChangeset = [];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("pin removed nodes => remove", () => {
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const input = [Mark.pin(1, brand(0), { cellId })];
		const expected: TestChangeset = [Mark.delete(1, brand(0), { detachIdOverride: cellId })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("insert & delete => revive & delete", () => {
		const transient = [
			Mark.attachAndDetach(Mark.insert(1, brand(1)), Mark.delete(1, brand(0))),
		];

		const inverse = invert(transient);
		const expected = [
			Mark.delete(1, brand(1), {
				cellId: { revision: tag1, localId: brand(0) },
			}),
		];

		assert.deepEqual(inverse, expected);
	});

	it("Insert and move => move and delete", () => {
		const insertAndMove = [
			Mark.attachAndDetach(Mark.insert(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1)),
		];

		const inverse = invert(insertAndMove);
		const expected = [
			Mark.attachAndDetach(
				Mark.returnTo(1, brand(1), { revision: tag1, localId: brand(1) }),
				Mark.delete(1, brand(0)),
			),
			{ count: 1 },
			Mark.returnFrom(1, brand(1)),
		];

		assert.deepEqual(inverse, expected);
	});

	it("Move and delete => revive and return", () => {
		const moveAndDelete = [
			Mark.moveOut(1, brand(0)),
			{ count: 1 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
		];

		const inverse = invert(moveAndDelete);
		const expected = [
			Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
			{ count: 1 },
			Mark.returnFrom(1, brand(0), {
				cellId: { revision: tag1, localId: brand(1) },
			}),
		];

		assert.deepEqual(inverse, expected);
	});

	it("Move chain => return chain", () => {
		const moves = [
			Mark.moveOut(1, brand(0), {
				finalEndpoint: { localId: brand(1) },
			}),
			{ count: 1 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1), { finalEndpoint: { localId: brand(0) } }),
		];

		const inverse = invert(moves);
		const expected = [
			Mark.returnTo(
				1,
				brand(0),
				{ revision: tag1, localId: brand(0) },
				{ finalEndpoint: { localId: brand(1) } },
			),
			{ count: 1 },
			Mark.attachAndDetach(
				Mark.returnTo(1, brand(1), { revision: tag1, localId: brand(1) }),
				Mark.returnFrom(1, brand(0)),
			),
			{ count: 1 },
			Mark.returnFrom(1, brand(1), {
				finalEndpoint: { localId: brand(0) },
			}),
		];

		assert.deepEqual(inverse, expected);
	});

	describe("Redundant changes", () => {
		it("delete (same detach ID)", () => {
			const cellId = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
			const input = [Mark.onEmptyCell(cellId, Mark.delete(1, brand(0)))];
			const actual = invert(input, tag1);
			assert.deepEqual(actual, []);
		});

		it("delete (same detach ID through metadata)", () => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const input = [Mark.onEmptyCell(cellId, Mark.delete(1, brand(0)))];

			const actual = invertChange(tagRollbackInverse(input, tag2, tag1));
			assert.deepEqual(actual, []);
		});

		it("delete (different detach ID)", () => {
			const startId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const endId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const input = [
				Mark.delete(1, endId, {
					cellId: startId,
				}),
			];

			const actual = invert(input, tag2);
			const expected = [
				Mark.delete(1, brand(0), {
					cellId: endId,
					detachIdOverride: startId,
				}),
			];
			assert.deepEqual(actual, expected);
		});

		it("redundant revive => skip", () => {
			const input = Change.redundantRevive(1, 1, { revision: tag1, localId: brand(0) });
			const actual = invert(input);
			assert.deepEqual(actual, []);
		});
	});
});
