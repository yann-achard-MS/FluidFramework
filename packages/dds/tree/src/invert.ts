/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Offset,
	OpId,
	Rebased as R,
	SeqNumber,
} from "./format";
import {
	fail,
	isEnd,
	isModify,
	isOffset,
	isPrior,
	lengthFromMark,
	mapObject,
	Pointer,
} from "./utils";

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
		if (mods.length > 0) {
			newSet.mods = mods;
		}
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
				case "SetValue":
				case "RevertValue": {
					newMarks.push({ type: "RevertValue", seq });
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
						type: "ReviveSet",
						seq,
						...optLengthFromObj(mark),
						...optModsFromObj(mark, invertModsMarks(mark.mods, context)),
					});
					break;
				}
				case "ReviveSet": {
					newMarks.push({
						type: "Delete",
						...optLengthFromObj(mark),
						...optModsFromObj(mark, invertModsMarks(mark.mods, context)),
					});
					break;
				}
				case "ReviveSlice": {
					newMarks.push({
						type: "DeleteStart",
						op: mark.op,
						// TODO: side and tiebreak
					});
					const mods = invertModsMarks(mark.mods, context);
					const length = mark.length ?? 1;
					let modsLength = 0;
					if (mods) {
						newMarks.push(...mods);
						modsLength = mods.reduce<number>((l, m) => l + lengthFromMark(m), 0);
					}
					if (modsLength < length) {
						newMarks.push(length - modsLength);
					}
					newMarks.push({
						type: "End",
						op: mark.op,
						// TODO: side and tiebreak
					});
					break;
				}
				case "ReturnSet":
				case "MoveInSet": {
					const moveOut: R.MoveOut = {
						type: "MoveOut",
						op: mark.op,
						...optLengthFromObj(mark),
						// TODO: side and tiebreak
					};
					newMarks.push(moveOut);
					context.newSetMoveOuts.set(mark.op, moveOut);
					break;
				}
				case "ReturnSlice":
				case "MoveInSlice": {
					newMarks.push({
						type: "MoveOutStart",
						op: mark.op,
						// TODO: side and tiebreak
					});
					context.newSliceMoveOuts.set(mark.op, Pointer.fromMarks(newMarks).skipMarks(newMarks.length));
					newMarks.push({
						type: "End",
						op: mark.op,
						// TODO: side and tiebreak
					});
					break;
				}
				case "MoveOut": {
					context.newSetMoveOutMods.set(mark.op, invertModsMarks(mark.mods, context) ?? []);
					newMarks.push({
						type: "ReturnSet",
						seq,
						op: mark.op,
						...optLengthFromObj(mark),
					});
					break;
				}
				case "DeleteStart": {
					const firstMod = iMark + 1;
					const endBound =
						findIndexFrom(marks, firstMod, (m) => isEnd(m) && m.op === mark.op)
						?? fail("No matching end mark for DeleteStart")
					;
					let lastSubstantiveMod = endBound - 1;
					while (isOffset(marks[lastSubstantiveMod]) && lastSubstantiveMod >= firstMod) {
						lastSubstantiveMod -= 1;
					}
					const revive: R.ReviveSlice = {
						type: "ReviveSlice",
						seq,
						op: mark.op,
						// TODO: side and tiebreak
					};
					const mods = invertMarks(marks.slice(firstMod, lastSubstantiveMod + 1), context) as R.ModsTrail;
					if (endBound - firstMod !== 1) {
						revive.length = endBound - firstMod;
					}
					if (mods.length > 0) {
						revive.mods = mods;
					}
					newMarks.push(revive);
					iMark = endBound;
					break;
				}
				case "MoveOutStart": {
					const firstMod = iMark + 1;
					const endBound =
						findIndexFrom(marks, firstMod, (m) => isEnd(m) && m.op === mark.op)
						?? fail("No matching end mark for MoveOutStart")
					;
					// let lastSubstantiveMod = endBound - 1;
					// while (isOffset(marks[lastSubstantiveMod]) && lastSubstantiveMod >= firstMod) {
					// 	lastSubstantiveMod -= 1;
					// }
					const mods = invertMarks(marks.slice(firstMod, endBound), context);
					// const modsLength = mods.reduce<number>((l, m) => l + lengthFromMark(m), 0);
					// if (modsLength < length) {
					// 	mods.push(length - modsLength);
					// }
					context.newSliceMoveOutMods.set(mark.op, mods);
					newMarks.push({
						type: "ReturnSlice",
						seq,
						op: mark.op,
						// TODO: side and tiebreak
					});
					iMark = endBound;
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
