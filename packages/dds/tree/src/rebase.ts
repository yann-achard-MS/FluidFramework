/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Sequenced as S,
	Rebased as R,
	Offset,
	SeqNumber,
} from "./format";
import { normalizeFrame } from "./normalize";
import {
	clone,
	fail,
	findIndexFrom,
	isAttachSegment,
	isBound,
	isChangeFrame,
	isConstraintFrame,
	isDelete,
	isDetachSegment,
	isEnd,
	isModify,
	isMoveOut,
	isOffset,
	isPrior,
	isPriorBound,
	isPriorDetach,
	isPriorSliceEnd,
	isPriorStartBound,
	isReturn,
	isRevert,
	isReviveSet,
	isReviveSlice,
	isSetValue,
	isStartBound,
	lengthFromMark,
	mapObject,
	Pointer,
	splitMark,
} from "./utils";

export function rebase(original: R.Transaction, base: S.Transaction): R.Transaction {
	return {
		ref: original.ref,
		newRef: base.seq,
		frames: original.frames.map((frame) => rebaseFrame(frame, original, base)),
	};
}

function rebaseFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.TransactionFrame {
	if (isConstraintFrame(frame)) {
		return rebaseConstraintFrame(frame, original, base);
	} else if (isChangeFrame(frame)) {
		return rebaseChangeFrame(frame, original, base);
	}
	fail("Transaction frame is neither a constraint nor a change");
}

function rebaseChangeFrame(
	frameToRebase: R.ChangeFrame,
	originalTransaction: R.Transaction,
	baseTransaction: S.Transaction,
): R.ChangeFrame {
	const baseSeq = baseTransaction.seq;
	const newFrame: R.ChangeFrame = clone(frameToRebase);
	for (const baseFrame of baseTransaction.frames) {
		if (isChangeFrame(baseFrame)) {
			if (baseFrame.moves !== undefined) {
				if (newFrame.priorMoves === undefined) {
					newFrame.priorMoves = {};
				}
				newFrame.priorMoves[baseSeq] = clone(baseFrame.moves);
			}
			rebaseOverFrame(newFrame, baseFrame, baseSeq);
		}
	}
	normalizeFrame(newFrame);
	return newFrame;
}

function rebaseOverFrame(
	orig: R.ChangeFrame,
	base: R.ChangeFrame,
	seq: SeqNumber,
): void {
	rebaseMarks(orig.marks, base.marks, { seq, base });
}

function rebaseMarks(
	curr: R.TraitMarks,
	base: R.TraitMarks,
	context: Context,
): void {
	let ptr = Pointer.fromMarks(curr);
	let iBaseMark = 0;
	while (iBaseMark < base.length) {
		const baseMark = base[iBaseMark];
		if (isStartBound(baseMark)) {
			const endIndex = findIndexFrom(
				base,
				iBaseMark + 1,
				(m) => isEnd(m) && m.op === baseMark.op,
			) ?? fail("Missing slice end");
			rebaseOverSlice(
				ptr,
				baseMark,
				base[endIndex] as R.SliceEnd,
				base.slice(iBaseMark + 1, endIndex),
				context,
			);
			iBaseMark = endIndex;
		} else if (isPriorStartBound(baseMark)) {
			const endIndex = findIndexFrom(
				base,
				iBaseMark + 1,
				(m) => isPriorSliceEnd(m) && m.op === baseMark.op && m.seq === baseMark.seq,
			) ?? fail("Missing slice end");
			rebaseOverPriorSlice(
				ptr,
				baseMark,
				base[endIndex] as R.PriorRangeEnd,
				base.slice(iBaseMark + 1, endIndex),
				context,
			);
			iBaseMark = endIndex;
		} else {
			ptr = rebaseOverMark(ptr, baseMark, context);
		}
		iBaseMark += 1;
	}
}

function rebaseOverSlice(
	startPtr: Pointer,
	baseStart: R.MoveOutStart | R.DeleteStart,
	baseEnd: R.SliceEnd,
	slice: R.TraitMarks,
	context: Context,
): Pointer {
	let ptr = startPtr;
	ptr = ptr.insert(priorFromBound(baseStart, context));
	for (const baseMark of slice) {
		ptr = rebaseOverMark(ptr, baseMark, context);
	}
	ptr = ptr.insert(priorFromBound(baseEnd, context));
	return ptr;
}

function rebaseOverPriorSlice(
	startPtr: Pointer,
	baseStart: R.PriorDeleteStart | R.PriorMoveOutStart,
	baseEnd: R.PriorRangeEnd,
	slice: R.TraitMarks,
	context: Context,
): Pointer {
	let ptr = startPtr;
	ptr = ptr.insert(baseStart);
	for (const baseMark of slice) {
		ptr = rebaseOverMark(ptr, baseMark, context);
	}
	ptr = ptr.insert(baseEnd);
	return ptr;
}

function rebaseOverMark(
	startPtr: Pointer,
	baseMark: R.TraitMark,
	context: Context,
): Pointer {
	let ptr = startPtr;
	while (ptr.mark !== undefined && (isAttachSegment(ptr.mark) || isReviveSet(ptr.mark) || isReviveSlice(ptr.mark))) {
		ptr = ptr.skipMarks(1);
	}
	const mark1 = ptr.mark;
	if (mark1 === undefined) {
		ptr = insertPriorFromTraitMark(ptr, baseMark, context);
	} else if (isBound(baseMark)) {
		fail("TODO");
	} else {
		while (ptr.mark !== undefined && (isAttachSegment(ptr.mark) || isBound(ptr.mark) || isReviveSet(ptr.mark))) {
			ptr = ptr.skipMarks(1);
		}
		const mark = ptr.mark;
		if (mark === undefined) {
			ptr = insertPriorFromTraitMark(ptr, baseMark, context);
		} else {
			if (isAttachSegment(baseMark)) {
				ptr = ptr.insert(lengthFromMark(baseMark));
			} else if (isPriorBound(mark)) {
				if (isReviveSlice(baseMark)) {
					// Temporarily remove the starting bound
					ptr = ptr.deleteMarks(1);
					let foundEnd = false;
					let reviveCount = baseMark.length ?? 1;
					while (foundEnd === false && reviveCount > 0) {
						const innerMark = ptr.mark ?? fail("Missing slice end");
						if (isAttachSegment(innerMark)) {
							ptr = ptr.skipMarks(1);
						} else if (isOffset(innerMark)) {
							if (innerMark > reviveCount) {
								fail("TODO"); // Is this even possible?
							} else {
								reviveCount -= innerMark;
								ptr = ptr.skipMarks(1);
							}
						} else if (
							isPriorBound(innerMark)
							&& innerMark.seq === mark.seq
							&& innerMark.op === mark.op
						) {
							foundEnd = true;
						} else {
							fail("Unexpected segment kind");
						}
					}
					if (foundEnd) {
						ptr = ptr.deleteMarks(1);
						if (reviveCount > 0) {
							const snd = splitMark(baseMark, (baseMark.length ?? 1) - reviveCount)[1];
							ptr = rebaseOverMark(ptr, snd, context);
						}
					} else {
						const innerMark = ptr.mark ?? fail("Missing slice end");
						if (
							isPriorBound(innerMark)
							&& innerMark.seq === mark.seq
							&& innerMark.op === mark.op
						) {
							ptr = ptr.deleteMarks(1);
						} else {
							// Reintroduce the mark
							ptr = ptr.insert(mark);
						}
					}
				} else {
					const endPtr = ptr.findSliceEnd();
					ptr = rebaseOverMark(endPtr.skipMarks(1), baseMark, context);
				}
			} else {
				const baseMarkLength = lengthFromMark(baseMark);
				const markLength = lengthFromMark(mark);
				if (markLength === 0 || baseMarkLength === 0) {
					fail("Unexpected segment type");
				} else {
					if (baseMarkLength < markLength) {
						ptr.ensureMarkStart(baseMarkLength);
						ptr = rebaseOverMark(ptr, baseMark, context);
					} else if (baseMarkLength > markLength) {
						const [fst, snd] = splitMark(baseMark, markLength);
						ptr = rebaseOverMark(ptr, fst, context);
						ptr = rebaseOverMark(ptr, snd, context);
					} else {
						if (isModify(baseMark)) {
							if (isModify(mark)) {
								rebaseOverModify(mark, baseMark, context);
							} else if (isSetValue(mark)) {
								ptr = ptr.skipMarks(1);
							} else if (isDetachSegment(mark)) {
								const mods = mark.mods ?? [1];
								if (mark.mods !== undefined && isModify(mods[0])) {
									rebaseOverModify(mods[0], baseMark, context);
								}
								ptr = ptr.skipMarks(1);
							} else {
								fail("Unexpected segment type");
							}
						} else if (isDelete(baseMark)) {
							ptr = ptr.replaceMark({
								type: "PriorSetDetachStart",
								seq: context.seq,
								length: baseMark.length,
							});
						} else if (isMoveOut(baseMark)) {
							ptr = ptr.replaceMark({
								type: "PriorSetDetachStart",
								seq: context.seq,
								length: baseMark.length,
							});
						} else if (isOffset(baseMark)) {
							ptr = ptr.ensureMarkStart(baseMarkLength);
						} else if (isReviveSet(baseMark)) {
							if (isPriorDetach(mark)) {
								ptr = ptr.replaceMark(markLength);
							} else {
								fail("A Revive segment should always match up with a PriorSetDetach segment");
							}
						} else if (isReturn(baseMark)) {
							fail("TODO");
						} else {
							ptr = insertPriorFromTraitMark(ptr, baseMark, context);
						}
					}
				}
			}
		}
	}
	return ptr;
}

function rebaseOverModify(mark: R.Modify, baseMark: R.Modify, context: Context): void {
	if (mark.modify === undefined) {
		mark.modify = {};
	}
	for (const [k,v] of Object.entries(baseMark.modify ?? {})) {
		if (k in mark.modify) {
			console.log(`Entering trait ${k}`);
			rebaseMarks(mark.modify[k], v, context);
			console.log(`Exiting trait ${k}`);
		} else {
			// The line below is disabled because we shouldn't need priors in traits
			// that the rebased change doesn't touch. Note that it's still an open
			// question of whether that's still true in the case of slice moves (see scenario G).
			// mark.modify[k] = priorsFromTraitMarks([], v, context);
		}
	}
}

type PriorTraitMark = R.PriorBound | R.Modify<R.PriorBound, false> | Offset;

function priorsFromModify(modify: R.Modify, context: Context): R.Modify<PriorTraitMark, false> {
	const mods = modify.modify;
	if (mods === undefined) {
		return {};
	}
	return {
		modify: mapObject(mods, (marks) => priorsFromTraitMarks([], marks, context)),
	};
}

function priorsFromTraitMarks(
	marks: PriorTraitMark[],
	baseMarks: R.TraitMarks,
	context: Context,
): PriorTraitMark[] {
	for (const baseMark of baseMarks) {
		const newMark = priorFromTraitMark(baseMark, context);
		if (newMark !== undefined) {
			marks.push();
		}
	}
	return marks;
}

function insertPriorFromTraitMark(
	ptr: Pointer,
	baseMark: R.TraitMark,
	context: Context,
): Pointer {
	const newMark = priorFromTraitMark(baseMark, context);
	if (newMark !== undefined) {
		return ptr.insert(newMark);
	}
	return ptr;
}

function priorFromTraitMark(
	base: R.TraitMark,
	context: Context,
): PriorTraitMark | undefined {
	if (isModify(base)) {
		return priorsFromModify(base, context);
	}
	if (isDelete(base)) {
		return {
			type: "PriorSetDetachStart",
			seq: context.seq,
			length: base.length,
		};
	}
	if (isMoveOut(base)) {
		return {
			type: "PriorSetDetachStart",
			seq: context.seq,
			length: base.length,
		};
	}
	if (isOffset(base) || isAttachSegment(base) || isRevert(base)) {
		return lengthFromMark(base);
	}
	if (isBound(base)) {
		return priorFromBound(base, context);
	}
	if (isPrior(base) || isSetValue(base)) {
		return undefined;
	}
	fail("Unexpected mark type");
}

// function optLength<T extends { length?: number; }>(input: T): ({ length?: number; }) {
// 	if (input.length !== undefined && input.length !== 1) {
// 		return { length: input.length };
// 	}
// 	return {};
// }

function rebaseConstraintFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.ConstraintFrame {
	fail("Function not implemented.");
}

function priorFromBound(bound: R.SliceBound, context: Context): R.PriorSliceBound {
	switch (bound.type) {
		case "DeleteStart": {
			return {
				type: "PriorDeleteStart",
				seq: context.seq,
				op: bound.op,
			};
		}
		case "MoveOutStart": {
			return {
				type: "PriorMoveOutStart",
				seq: context.seq,
				op: bound.op,
			};
		}
		case "End": {
			return {
				type: "PriorRangeEnd",
				seq: context.seq,
				op: bound.op,
			};
		}
		default: fail("Unexpected bound type");
	}
}

interface Context {
	seq: SeqNumber;
	base: R.ChangeFrame;
}
