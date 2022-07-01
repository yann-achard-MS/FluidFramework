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

export function normalizeMarks(marks: T.TraitMarks): void {
	if (marks.tombs !== undefined) {
		while (typeof marks.tombs[marks.tombs.length - 1] === "number") {
			marks.tombs.pop();
		}
		if (marks.tombs.length === 0) {
			delete marks.tombs;
		}
	}
	if (marks.attach !== undefined) {
		if (marks.attach.length === 0) {
			delete marks.attach;
		}
	}
	if (marks.gaps !== undefined) {
		if (marks.gaps.length === 0) {
			delete marks.gaps;
		}
	}
	if (marks.nodes !== undefined) {
		if (marks.nodes.length === 0) {
			delete marks.nodes;
		}
	}
	if (marks.modify !== undefined) {
		for (const modify of marks.modify) {
			if (typeof modify === "object") {
				for (const key of Object.keys(modify)) {
					normalizeMarks(modify[key]);
				}
			}
		}
		if (marks.modify.length === 0) {
			delete marks.modify;
		}
	}
}

export function normalizePath(path: TreePath): TreePath {
	return path;
}
