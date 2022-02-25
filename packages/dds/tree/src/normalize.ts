/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Rebased as R,
} from "./format";
import { isDelete, isModify, isMoveIn, isMoveOut, isOffset, isPrior } from "./utils";

export function normalizeFrame(frame: R.ChangeFrame): void {
	normalizeMarks(frame.marks);
}

function normalizeMarks(marks: R.TraitMarks): void {
	let iMark = marks.length - 1;
	while (iMark >= 0) {
		const mark = marks[iMark];
		if (isOffset(mark)) {
			if (iMark === marks.length - 1) {
				marks.pop();
			} else if (iMark > 0) {
				const prevMark = marks[iMark - 1];
				if (isOffset(prevMark)) {
					marks.splice(iMark - 1, 2, mark + prevMark);
				}
			}
		} else if (isDelete(mark) || isMoveOut(mark) || isMoveIn(mark) || isPrior(mark)) {
			if (mark.mods !== undefined) {
				normalizeMarks(mark.mods);
			}
			if (mark.length === 1) {
				delete mark.length;
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
