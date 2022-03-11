/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Offset,
	Rebased as R,
	SeqNumber,
} from "./format";
import { fail, isEnd, isModify, isOffset, isPrior, mapObject } from "./utils";

export function invert(frame: R.ChangeFrame, seq: SeqNumber): R.ChangeFrame {
	const moves = frame.moves?.map((mv) => ({ src: mv.dst, dst: mv.src }));
	const marks = invertMarks(frame.marks, seq);

	return {
		moves,
		marks,
	};
}

function invertMarks(marks: R.TraitMarks, seq: SeqNumber): R.TraitMarks {
	// const context: Context = { seq, marks };
	// return marks.map((mark, iMark) => invertMark(mark, iMark, context));
	const newMarks: R.TraitMarks = [];
	let iMark = 0;
	while (iMark < marks.length) {
		const mark = marks[iMark];
		if (isOffset(mark) || isPrior(mark)) {
			newMarks.push(mark);
		} else if (isModify(mark)) {
			// TODO: inverse value
			if (mark.modify !== undefined) {
				newMarks.push({
					modify: mapObject(mark.modify, (ms) => invertMarks(ms, seq)),
				});
			}
			newMarks.push(1);
		} else {
			switch (mark.type) {
				case "SetValue": {
					// TODO: inverse SetValue
					newMarks.push(1);
					break;
				}
				case "Insert": {
					newMarks.push({
						type: "Delete",
						length: mark.content.length,
						mods: invertModsFromInsertedContent(mark.content, seq),
					});
					break;
				}
				case "Delete": {
					newMarks.push({ type: "Revive", seq, length: mark.length });
					break;
				}
				case "Revive": {
					newMarks.push({ type: "Delete", length: mark.length });
					break;
				}
				case "MoveIn": {
					// TODO: invert to a slice move-out
					newMarks.push({ type: "MoveOut", length: mark.length, moveId: mark.moveId });
					break;
				}
				case "MoveOut": {
					newMarks.push({ type: "Return", seq, length: mark.length, moveId: mark.moveId });
					break;
				}
				case "Return": {
					newMarks.push({ type: "MoveOut", length: mark.length, moveId: mark.moveId });
					break;
				}
				case "DeleteStart": {
					let iMarkInSlice = iMark + 1;
					do {
						const markInSlice = marks[iMarkInSlice];
						if (isOffset(markInSlice)) {
							newMarks.push({ type: "Revive", seq, length: markInSlice });
						} else if (isPrior(markInSlice)) {
							newMarks.push(markInSlice);
						} else if (isEnd(markInSlice) && markInSlice.moveId === mark.moveId) {
							break;
						} else {
							fail("Unexpected mark within deleted slice");
						}
						iMarkInSlice += 1;
					}
					// eslint-disable-next-line no-constant-condition
					while (true);
					iMark = iMarkInSlice;
					break;
				}
				case "MoveOutStart": {
					let iMarkInSlice = iMark + 1;
					do {
						const markInSlice = marks[iMarkInSlice];
						if (isOffset(markInSlice)) {
							newMarks.push({ type: "Return", seq, length: markInSlice, moveId: mark.moveId });
						} else if (isPrior(markInSlice)) {
							newMarks.push(markInSlice);
						} else if (isEnd(markInSlice) && markInSlice.moveId === mark.moveId) {
							break;
						} else {
							fail("Unexpected mark within deleted slice");
						}
						iMarkInSlice += 1;
					}
					// eslint-disable-next-line no-constant-condition
					while (true);
					// This leaves iMark on the "End" mark.
					iMark = iMarkInSlice;
					break;
				}
				default: fail("Unexpected mark type");
			}
		}
		iMark += 1;
	}
	return newMarks;
}

function invertModsFromInsertedContent(content: R.ProtoNode[], seq: number): (Offset | R.Modify<R.Mark, false>)[] {
	throw new Error("Function not implemented.");
}
