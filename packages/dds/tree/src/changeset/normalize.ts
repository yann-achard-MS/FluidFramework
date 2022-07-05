/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Transposed as T, TreePath } from "./format";

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

function trimArray<TKey extends string>(key: TKey, obj: { [_ in TKey]?: (number | unknown)[]; }): void {
	const array = obj[key];
	if (array !== undefined) {
		while (typeof array[array.length - 1] === "number") {
			array.pop();
		}
		if (array.length === 0) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete obj[key];
		}
	}
}

function trimArrays<TKey extends string>(keys: TKey[], obj: { [_ in TKey]?: (number | unknown)[]; }): void {
	for (const key of keys) {
		trimArray(key, obj);
	}
}

export function normalizeMarks(marks: T.TraitMarks): void {
	if (marks.modify !== undefined) {
		for (const modify of marks.modify) {
			if (typeof modify === "object") {
				for (const key of Object.keys(modify)) {
					normalizeMarks(modify[key]);
				}
			}
		}
	}
	trimArrays(["tombs", "attach", "nodes", "gaps", "modify"], marks);
}

export function normalizePath(path: TreePath): TreePath {
	return path;
}
