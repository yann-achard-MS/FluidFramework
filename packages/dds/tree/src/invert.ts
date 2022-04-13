/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Offset,
	RangeType,
	Rebased as R,
	SeqNumber,
} from "./format";
import { normalizeMarks } from "./normalize";
import {
	clone,
	fail,
	isModify,
	isOffset,
	isPrior,
	lengthFromOffsets,
	mapObject,
	neverCase,
} from "./utils";

export function invert(frame: R.ChangeFrame, seq: SeqNumber): R.ChangeFrame {
	const context: Context = {
		frame,
		seq,
		underDelete: false,
	};
	const moves = frame.moves?.map((mv) => ({ id: mv.id, src: clone(mv.dst), dst: clone(mv.src) }));
	const marks = invertMarks(frame.marks, context);
	normalizeMarks(marks);

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

function optModsFromObj<T extends { mods?: M[] }, M>(input: T, output: M[] | undefined): { mods?: M[] } {
	if (input.mods !== undefined && input.mods.length !== 0) {
		return { mods: output };
	}
	return {};
}

interface Context {
	readonly frame: Readonly<R.ChangeFrame>
	readonly seq: SeqNumber;
	readonly underDelete: boolean;
}

function invertMarksOpt(marks: R.TraitMarks | undefined, context: Context): R.TraitMarks | undefined {
	if (marks === undefined) {
		return undefined;
	}
	return invertMarks(marks, context);
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
					const tailOffset = mark.content.length - lengthFromOffsets(mark.mods);
					if (context.underDelete) {
						const mods = invertMarksOpt(mark.mods, context) ?? [];
						newMarks.push(...mods, tailOffset);
					} else {
						const mods = invertMarksOpt(mark.mods, { ...context, underDelete: true }) ?? [];
						mods.push(tailOffset);
						newMarks.push({
							type: "DeleteSet",
							id: mark.id * -1,
							length: lengthFromOffsets(mods),
							mods,
						});
					}
					break;
				}
				case "DeleteSet": {
					newMarks.push({
						type: "Revive",
						range: RangeType.Set,
						priorSeq: seq,
						priorId: mark.id,
						id: mark.id * -1,
						...optLengthFromObj(mark),
						...optModsFromObj(mark, invertMarksOpt(mark.mods, context)),
					});
					break;
				}
				case "DeleteSlice": {
					newMarks.push({
						type: "Revive",
						range: RangeType.Slice,
						priorSeq: seq,
						priorId: mark.id,
						id: mark.id * -1,
						...optLengthFromObj(mark),
						...optModsFromObj(mark, invertMarksOpt(mark.mods, context)),
					});
					break;
				}
				case "Revive": {
					switch (mark.range) {
						case RangeType.Set: {
							newMarks.push({
								type: "DeleteSet",
								id: mark.id * -1,
								...optLengthFromObj(mark),
								...optModsFromObj(mark, invertMarksOpt(mark.mods, context)),
							});
							break;
						}
						case RangeType.Slice: {
							newMarks.push({
								type: "DeleteSlice",
								id: mark.id * -1,
								...optLengthFromObj(mark),
								...optModsFromObj(mark, invertMarksOpt(mark.mods, context)),
							});
							break;
						}
						default: neverCase(mark.range);
					}
					break;
				}
				case "MoveIn":
				case "Return": {
					switch (mark.range) {
						case RangeType.Set: {
							newMarks.push({
								type: "MoveOutSet",
								id: mark.id * -1,
								...optLengthFromObj(mark),
								...optModsFromObj(mark, invertMarksOpt(mark.mods, context)),
							});
							break;
						}
						case RangeType.Slice: {
							newMarks.push({
								type: "MoveOutSlice",
								id: mark.id * -1,
								...optLengthFromObj(mark),
								...optModsFromObj(mark, invertMarksOpt(mark.mods, context)),
							});
							break;
						}
						default: neverCase(mark.range);
					}
					break;
				}
				case "MoveOutSet": {
					newMarks.push({
						type: "Return",
						range: RangeType.Set,
						priorSeq: seq,
						priorId: mark.id,
						id: mark.id * -1,
						...optLengthFromObj(mark),
					});
					break;
				}
				case "MoveOutSlice": {
					newMarks.push({
						type: "Return",
						range: RangeType.Slice,
						priorSeq: seq,
						priorId: mark.id,
						id: mark.id * -1,
						...optLengthFromObj(mark),
					});
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
