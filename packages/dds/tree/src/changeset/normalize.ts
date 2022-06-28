/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Transposed as T, TreePath } from "./format";

export function normalizeFrame(frame: T.Changeset): void {
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
}

export function normalizePath(path: TreePath): TreePath {
	return path;
}
