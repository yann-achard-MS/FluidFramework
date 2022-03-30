/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Rebased as R,
} from "./format";
import {
	isDelete,
	isInsert,
	isModify,
	isMoveIn,
	isMoveOut,
	isOffset,
	isPrior,
	isPriorDetach,
} from "./utils";

export function normalizeFrame(frame: R.ChangeFrame): void {
	if (frame.moves?.length === 0) {
		delete frame.moves;
	}
	normalizeMarks(frame.marks);
}

function normalizeMarks(marks: R.TraitMarks): void {
	let iMark = marks.length - 1;
	while (iMark >= 0) {
		const prevMark = marks[iMark - 1] as R.TraitMark | undefined;
		const mark = marks[iMark];
		if (isOffset(mark)) {
			if (iMark === marks.length - 1) {
				marks.pop();
			} else if (iMark > 0) {
				if (isOffset(prevMark)) {
					marks.splice(iMark - 1, 2, mark + prevMark);
				}
			}
		} else if (isDelete(mark) || isMoveOut(mark) || isMoveIn(mark) || isPriorDetach(mark) || isInsert(mark)) {
			if (mark.mods !== undefined) {
				normalizeMarks(mark.mods);
				if (mark.mods.length === 0 || (mark.mods.length === 1 && isOffset(mark.mods[0]))) {
					delete mark.mods;
				}
			} else if ("mods" in mark) {
				delete mark.mods;
			}
			if ("length" in mark && (mark.length === 1 || mark.length === undefined)) {
				delete mark.length;
			}
			if (prevMark !== undefined && (isInsert(prevMark) || isDelete(prevMark) || isPrior(prevMark))) {
				if (isInsert(mark)) {
					if (isInsert(prevMark)) {
						prevMark.content.push(...mark.content);
						marks.splice(iMark, 1);
					}
				} else if (
					(isPriorDetach(mark) === false && mark.type === prevMark.type)
					|| (isPriorDetach(mark) && isPriorDetach(prevMark) && mark.seq === prevMark.seq)
				) {
					const prevLen = prevMark.length ?? 1;
					const mods = prevMark.mods ?? [];
					if (mark.mods) {
						if (mods.length < prevLen) {
							mods.push(prevLen - mods.length);
						}
						mods.push(...mark.mods);
					}
					prevMark.mods = mods;
					prevMark.length = prevLen + (mark.length ?? 1);
					marks.splice(iMark, 1);
				}
			}
		} else if (isModify(mark)) {
			if (mark.modify !== undefined) {
				for (const v of Object.values(mark.modify)) {
					normalizeMarks(v);
				}
			}
		}
		iMark -= 1;
	}
}
