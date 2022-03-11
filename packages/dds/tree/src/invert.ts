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

function optLength<T extends { length?: number; }>(input: T): ({ length?: number; }) {
	if (input.length !== undefined && input.length !== 1) {
		return { length: input.length };
	}
	return {};
}

function optMods<T extends R.HasMods>(input: T, output: R.ModsTrail | undefined): R.HasMods {
	if (input.mods !== undefined && input.mods.length !== 0) {
		return { mods: output };
	}
	return {};
}

function invertMarks(marks: R.TraitMarks, seq: SeqNumber): R.TraitMarks {
	const newMarks: R.TraitMarks = [];
	let iMark = 0;
	while (iMark < marks.length) {
		const mark = marks[iMark];
		if (isOffset(mark) || isPrior(mark)) {
			newMarks.push(mark);
		} else if (isModify(mark)) {
			newMarks.push(invertModify(mark, seq));
		} else {
			switch (mark.type) {
				case "SetValue": {
					newMarks.push({ type: "RevertValue", seq });
					break;
				}
				case "RevertValue": {
					newMarks.push(1);
					break;
				}
				case "Insert": {
					newMarks.push({
						type: "Delete",
						...(mark.content.length !== 1 ? { length: mark.content.length } : {}),
						...optMods(mark, invertModsMarks(mark.mods, seq)),
					});
					break;
				}
				case "Delete": {
					newMarks.push({
						type: "Revive",
						seq,
						...optLength(mark),
						...optMods(mark, invertModsMarks(mark.mods, seq)),
					});
					break;
				}
				case "Revive": {
					newMarks.push({
						type: "Delete",
						...optLength(mark),
						...optMods(mark, invertModsMarks(mark.mods, seq)),
					});
					break;
				}
				case "MoveIn": {
					// TODO: invert to a slice move-out
					newMarks.push({
						type: "MoveOut",
						moveId: mark.moveId,
						...optLength(mark),
						...optMods(mark, invertModsMarks(mark.mods, seq)),
					});
					break;
				}
				case "MoveOut": {
					newMarks.push({
						type: "Return",
						seq,
						moveId: mark.moveId,
						...optLength(mark),
						...optMods(mark, invertModsMarks(mark.mods, seq)),
					});
					break;
				}
				case "Return": {
					newMarks.push({
						type: "MoveOut",
						moveId: mark.moveId,
						...optLength(mark),
						...optMods(mark, invertModsMarks(mark.mods, seq)),
					});
					break;
				}
				case "DeleteStart": {
					let iMarkInSlice = iMark + 1;
					do {
						const markInSlice = marks[iMarkInSlice];
						if (isOffset(markInSlice)) {
							newMarks.push({
								type: "Revive",
								seq,
								...(markInSlice > 1 ? { length: markInSlice } : {}),
							});
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
							newMarks.push({
								type: "Return",
								seq,
								...(markInSlice > 1 ? { length: markInSlice } : {}),
								moveId: mark.moveId,
							});
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

function invertModify(
	mark: R.Modify,
	seq: SeqNumber,
): R.Modify | Offset {
	const modify: R.Modify = {};
	if (mark.value !== undefined) {
		modify.value = { seq };
	}
	if (mark.modify !== undefined) {
		modify.modify = mapObject(mark.modify, (ms) => invertMarks(ms, seq));
	}
	return modify;
}

function invertModsMarks(
	marks: (Offset | R.ModsMark)[] | undefined,
	seq: SeqNumber,
): (Offset | R.ModsMark)[] | undefined {
	if (marks === undefined) {
		return undefined;
	}
	const newMarks: (Offset | R.ModsMark)[] = [];
	let iMark = 0;
	while (iMark < marks.length) {
		const mark = marks[iMark];
		if (isOffset(mark)) {
			newMarks.push(mark);
		} else if (isModify(mark)) {
			newMarks.push(invertModify(mark, seq));
		} else {
			switch (mark.type) {
				case "SetValue": {
					newMarks.push({ type: "RevertValue", seq });
					break;
				}
				case "RevertValue": {
					newMarks.push(1);
					break;
				}
				default: fail("Unexpected mark type");
			}
		}
		iMark += 1;
	}
	return newMarks;
}
