/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Offset,
	OpId,
	Rebased as R,
	SeqNumber,
	Sibling,
	Tiebreak,
} from "./format";
import { fail, isEnd, isModify, isOffset, isPrior, isSetValue, mapObject, Pointer } from "./utils";

export function invert(frame: R.ChangeFrame, seq: SeqNumber): R.ChangeFrame {
	const newSetMoveOuts = new Map<OpId, R.MoveOut>();
	const newSetMoveOutMods = new Map<OpId, R.ModsTrail>();
	const newSliceMoveOuts = new Map<OpId, Pointer>();
	const newSliceMoveOutMods = new Map<OpId, R.TraitMarks>();
	const context: Context = {
		frame,
		seq,
		newSetMoveOuts,
		newSetMoveOutMods,
		newSliceMoveOuts,
		newSliceMoveOutMods,
	};
	const moves = frame.moves?.map((mv) => ({ src: mv.dst, dst: mv.src }));
	const marks = invertMarks(frame.marks, context);

	for (const [op, newSet] of newSetMoveOuts) {
		const mods = newSetMoveOutMods.get(op) ?? fail("No matching mods for the given move-out");
		newSet.mods = mods;
	}

	for (const [op, newSetPtr] of newSliceMoveOuts) {
		const mods = newSliceMoveOutMods.get(op) ?? fail("No matching mods for the given move-out");
		let ptr = newSetPtr;
		for (const mod of mods) {
			ptr = ptr.insert(mod);
		}
	}

	if (moves !== undefined) {
		return {
			moves,
			marks,
		};
	}
	return {
		marks,
	};
}

function optLengthFromObj<T extends { length?: number; }>(input: T): ({ length?: number; }) {
	if (input.length !== undefined && input.length !== 1) {
		return { length: input.length };
	}
	return {};
}

function optModsFromObj<T extends R.HasMods>(input: T, output: R.ModsTrail | undefined): R.HasMods {
	if (input.mods !== undefined && input.mods.length !== 0) {
		return { mods: output };
	}
	return {};
}

interface Context {
	readonly frame: Readonly<R.ChangeFrame>
	readonly seq: SeqNumber;
	readonly newSetMoveOuts: Map<OpId, R.MoveOut>;
	readonly newSetMoveOutMods: Map<OpId, R.ModsTrail>;
	readonly newSliceMoveOuts: Map<OpId, Pointer>;
	readonly newSliceMoveOutMods: Map<OpId, R.TraitMarks>;
}

function invertMarks(marks: R.TraitMarks, context: Context): R.TraitMarks {
	const { seq } = context;
	const newMarks: R.TraitMarks = [];
	let iMark = 0;
	while (iMark < marks.length) {
		const mark = marks[iMark];
		if (isOffset(mark) || isPrior(mark)) {
			newMarks.push(mark);
		} else if (isModify(mark)) {
			newMarks.push(invertModify(mark, context));
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
						...optModsFromObj(mark, invertModsMarks(mark.mods, context)),
					});
					break;
				}
				case "Delete": {
					newMarks.push({
						type: "Revive",
						seq,
						...optLengthFromObj(mark),
						...optModsFromObj(mark, invertModsMarks(mark.mods, context)),
					});
					break;
				}
				case "Revive": {
					newMarks.push({
						type: "Delete",
						...optLengthFromObj(mark),
						...optModsFromObj(mark, invertModsMarks(mark.mods, context)),
					});
					break;
				}
				case "MoveInSet": {
					const moveOut: R.MoveOut = {
						type: "MoveOut",
						op: mark.op,
					};
					newMarks.push(moveOut);
					context.newSetMoveOuts.set(mark.op, moveOut);
					break;
				}
				case "MoveInSlice": {
					newMarks.push({
						type: "MoveOutStart",
						op: mark.op,
						side: Sibling.Next,
						tiebreak: Tiebreak.LastToFirst,
					});
					context.newSliceMoveOuts.set(mark.op, Pointer.fromMarks(newMarks).skipMarks(newMarks.length));
					newMarks.push({
						type: "End",
						op: mark.op,
						side: Sibling.Prev,
						tiebreak: Tiebreak.FirstToLast,
					});
					break;
				}
				case "MoveOut": {
					context.newSetMoveOutMods.set(mark.op, invertModsMarks(mark.mods, context) ?? []);
					newMarks.push({
						type: "ReturnSet",
						seq,
						op: mark.op,
					});
					break;
				}
				case "ReturnSet": {
					break;
				}
				case "ReturnSlice": {
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
								...(markInSlice !== 1 ? { length: markInSlice } : {}),
							});
						} else if (isSetValue(markInSlice)) {
							newMarks.push({
								type: "Revive",
								seq,
								mods: [{
									type: "RevertValue",
									seq,
								}],
							});
						} else if (isModify(markInSlice)) {
							newMarks.push({
								type: "Revive",
								seq,
								mods: [invertModify(markInSlice, context)],
							});
						} else if (isPrior(markInSlice)) {
							newMarks.push(markInSlice);
						} else if (isEnd(markInSlice) && markInSlice.op === mark.op) {
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
					newMarks.push({
						type: "ReturnSlice",
						seq,
						op: mark.op,
					});
					const endIndex =
						findIndexFrom(marks, iMark + 1, (m) => isEnd(m) && m.op === mark.op)
						?? fail("No matching end mark for MoveOutStart")
					;
					context.newSliceMoveOutMods.set(mark.op, invertMarks(marks.slice(iMark + 1, endIndex), context));
					iMark = endIndex;
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
	context: Context,
): R.Modify | Offset {
	const modify: R.Modify = {};
	if (mark.value !== undefined) {
		modify.value = { seq: context.seq };
	}
	if (mark.modify !== undefined) {
		modify.modify = mapObject(mark.modify, (ms) => invertMarks(ms, context));
	}
	return modify;
}

function invertModsMarks(
	marks: (Offset | R.ModsMark)[] | undefined,
	context: Context,
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
			newMarks.push(invertModify(mark, context));
		} else {
			switch (mark.type) {
				case "SetValue": {
					newMarks.push({ type: "RevertValue", seq: context.seq });
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

function findIndexFrom<T>(
	elements: readonly T[],
	startIndex: number,
	predicate: (element: Readonly<T>) => boolean,
): number | undefined {
	let index = startIndex;
	while (index < elements.length) {
		if (predicate(elements[index])) {
			return index;
		}
		index += 1;
	}
	return undefined;
}
