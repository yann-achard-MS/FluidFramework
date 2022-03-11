/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Squashed as Sq,
} from "./format";
import { isDelete, isInsert, isModify, isMoveIn, isMoveOut, isOffset, isPrior, isSegment } from "./utils";

export function normalizeFrame(frame: Sq.ChangeFrame): void {
	if (frame.moves?.length === 0) {
		delete frame.moves;
	}
	normalizeMarks(frame.marks);
}

function normalizeMarks(marks: Sq.TraitMarks): void {
	let iMark = marks.length - 1;
	while (iMark >= 0) {
		const prevMark = marks[iMark - 1] as Sq.TraitMark | undefined;
		const mark = marks[iMark];
		if (isOffset(mark)) {
			if (iMark === marks.length - 1) {
				marks.pop();
			} else if (iMark > 0) {
				if (isOffset(prevMark)) {
					marks.splice(iMark - 1, 2, mark + prevMark);
				}
			}
		} else if (isDelete(mark) || isMoveOut(mark) || isMoveIn(mark) || isPrior(mark) || isInsert(mark)) {
			if (!isInsert(mark)) {
				if (mark.mods !== undefined) {
					normalizeMarks(mark.mods);
					if (mark.mods.length === 0 || (mark.mods.length === 1 && isOffset(mark.mods[0]))) {
						delete mark.mods;
					}
				} else if ("mods" in mark) {
					delete mark.mods;
				}
				if (mark.length === 1) {
					delete mark.length;
				}
			}
			if (prevMark !== undefined && (isSegment(prevMark) || isPrior(prevMark))) {
				if (isInsert(mark)) {
					if (isInsert(prevMark)) {
						prevMark.content.push(...mark.content);
						marks.splice(iMark, 1);
					}
				} else if (
					(isPrior(mark) === false && mark.type === prevMark.type)
					|| (isPrior(mark) && isPrior(prevMark) && mark.seq === prevMark.seq)
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
