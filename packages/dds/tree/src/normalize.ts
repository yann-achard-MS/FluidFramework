/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Rebased as R, TreePath,
} from "./format";

export function normalizeFrame(frame: R.ChangeFrame): void {
	if (frame.moves !== undefined) {
		if (frame.moves.length === 0) {
			delete frame.moves;
		} else {
			frame.moves = frame.moves.map((m) => ({ id: m.id, src: normalizePath(m.src), dst: normalizePath(m.dst) }));
		}
	}
	normalizeMarks(frame.marks);
}

export function normalizeMarks(marks: R.TraitMarks): void {
}

export function normalizePath(path: TreePath): TreePath {
	if (typeof path === "object" && path[0] !== undefined) {
		return path[0] as TreePath;
	}
	return path;
}
