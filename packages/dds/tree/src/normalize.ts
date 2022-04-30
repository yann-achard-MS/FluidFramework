/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Rebased as R, TreePath,
} from "./format";
import {
	isDeleteSet,
	isInsert,
	isModify,
	isMoveIn,
	isMoveOutSet,
	isNumber,
	isPriorDetach,
	isRevive,
} from "./utils";

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
	let iMark = marks.length - 1;
	while (iMark >= 0) {
		const prevMark = marks[iMark - 1] as R.TraitMark | undefined;
		const mark = marks[iMark];
		if (isNumber(mark)) {
			if (iMark === marks.length - 1) {
				marks.pop();
			} else if (iMark > 0) {
				if (isNumber(prevMark)) {
					marks.splice(iMark - 1, 2, mark + prevMark);
				}
			}
		} else if (
			isDeleteSet(mark)
			|| isMoveOutSet(mark)
			|| isMoveIn(mark)
			|| isPriorDetach(mark)
			|| isInsert(mark)
			|| isRevive(mark)
		) {
			if (mark.mods !== undefined) {
				normalizeMarks(mark.mods);
				if (mark.mods.length === 0 || (mark.mods.length === 1 && isNumber(mark.mods[0]))) {
					delete mark.mods;
				}
			} else if ("mods" in mark) {
				delete mark.mods;
			}
			if ("length" in mark && (mark.length === 1 || mark.length === undefined)) {
				delete mark.length;
			}
		} else if (isModify(mark)) {
			let isEmpty = true;
			if (mark.modify !== undefined) {
				for (const [k, v] of Object.entries(mark.modify)) {
					normalizeMarks(v);
					if (v.length === 0) {
						// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
						delete mark.modify[k];
					} else {
						isEmpty = false;
					}
				}
				if (isEmpty) {
					marks.splice(iMark, 1, 1);
					// Go backward so we can normalize this mark again (which is now an offset).
					iMark += 1;
				}
			}
		}
		iMark -= 1;
	}
}

export function normalizePath(path: TreePath): TreePath {
	if (typeof path === "object" && path[0] !== undefined) {
		return path[0] as TreePath;
	}
	return path;
}
