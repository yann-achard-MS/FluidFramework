/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF, singleTextCursor } from "../../../feature-libraries";
import { brand } from "../../../util";
import { RevisionTag, TreeSchemaIdentifier } from "../../../core";

const type: TreeSchemaIdentifier = brand("Node");
const tag: RevisionTag = brand(42);

export type TestChangeset = SF.Changeset;

export const cases: {
	no_change: TestChangeset;
	insert: TestChangeset;
	delete: TestChangeset;
	revive: TestChangeset;
	move: TestChangeset;
	return: TestChangeset;
} = {
	no_change: [],
	insert: createInsertChangeset(1, 2, 1),
	delete: createDeleteChangeset(1, 3),
	revive: createReviveChangeset(2, 2, tag, 0),
	move: createMoveChangeset(1, 2, 2),
	return: createReturnChangeset(1, 3, 0, tag),
};

function createInsertChangeset(
	index: number,
	size: number,
	startingValue: number = 0,
): SF.Changeset {
	const content = [];
	while (content.length < size) {
		content.push({ type, value: startingValue + content.length });
	}
	return SF.sequenceFieldEditor.insert(index, content.map(singleTextCursor));
}

function createDeleteChangeset(startIndex: number, size: number): SF.Changeset {
	return SF.sequenceFieldEditor.delete(startIndex, size);
}

function createReviveChangeset(
	startIndex: number,
	count: number,
	detachedBy: RevisionTag,
	detachIndex?: number,
	conflictsWith?: RevisionTag,
	linage?: SF.LineageEvent[],
	lastDetachedBy?: RevisionTag,
): SF.Changeset {
	const markList = SF.sequenceFieldEditor.revive(startIndex, count, detachedBy, detachIndex);
	const mark = markList[markList.length - 1] as SF.Reattach;
	if (conflictsWith !== undefined) {
		mark.conflictsWith = conflictsWith;
	}
	if (lastDetachedBy !== undefined) {
		mark.lastDetachedBy = lastDetachedBy;
	}
	if (linage !== undefined) {
		mark.lineage = linage;
	}
	return markList;
}

function createIntentionalReviveChangeset(
	startIndex: number,
	count: number,
	detachedBy: RevisionTag,
	detachIndex?: number,
	conflictsWith?: RevisionTag,
	linage?: SF.LineageEvent[],
): SF.Changeset {
	const markList = SF.sequenceFieldEditor.revive(
		startIndex,
		count,
		detachedBy,
		detachIndex,
		true,
	);
	const mark = markList[markList.length - 1] as SF.Reattach;
	if (conflictsWith !== undefined) {
		mark.conflictsWith = conflictsWith;
	}
	if (linage !== undefined) {
		mark.lineage = linage;
	}
	return markList;
}

function createMoveChangeset(sourceIndex: number, count: number, destIndex: number): SF.Changeset {
	return SF.sequenceFieldEditor.move(sourceIndex, count, destIndex);
}

function createReturnChangeset(
	sourceIndex: number,
	count: number,
	destIndex: number,
	detachedBy: RevisionTag,
	detachIndex?: number,
): SF.Changeset {
	return SF.sequenceFieldEditor.return(sourceIndex, count, destIndex, detachedBy, detachIndex);
}

export const ChangeMaker = {
	insert: createInsertChangeset,
	delete: createDeleteChangeset,
	revive: createReviveChangeset,
	intentionalRevive: createIntentionalReviveChangeset,
	move: createMoveChangeset,
	return: createReturnChangeset,
};
