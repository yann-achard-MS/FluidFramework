/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { OffsetList, Transposed as T, TreePath } from "./format";

export function normalizeChangeSet(frame: T.Changeset): void {
	if (frame.moves !== undefined) {
		if (frame.moves.length === 0) {
			delete frame.moves;
		} else {
			frame.moves = frame.moves.map((m) => ({ id: m.id, src: normalizePath(m.src), dst: normalizePath(m.dst) }));
		}
	}
	normalizeMarks(frame.marks);
}

function trimOffsetList<
	TKey extends keyof TObj,
	TObj extends { [_ in TKey]?: OffsetList; },
>(key: TKey, obj: TObj): void {
	const array = obj[key];
	if (array !== undefined) {
		while (typeof array[array.length - 1] === "number") {
			array.pop();
		}
		if (array.length === 0) {
			// Only key that exist in the object and are of type `OffsetList` will be used here.
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete obj[key];
		}
	}
}

function trimOffsetLists<
	TKey extends keyof TObj,
	TObj extends { [_ in TKey]?: OffsetList; },
>(keys: TKey[], obj: TObj): void {
	for (const key of keys) {
		trimOffsetList(key, obj);
	}
}

export function normalizeMarks(marks: T.FieldMarks): void {
	if (marks.modify !== undefined) {
		for (const modify of marks.modify) {
			if (typeof modify === "object") {
				for (const key of Object.keys(modify)) {
					normalizeMarks(modify[key]);
				}
			}
		}
	}
	trimOffsetLists(["tombs", "attach", "nodes", "gaps", "modify", "values"], marks);
}

export function normalizePath(path: TreePath): TreePath {
	return path;
}
