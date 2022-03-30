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
	isAttachSegment,
	isBound,
	isChangeFrame,
	isConstraintFrame,
	isDelete,
	isDetachSegment,
	isModify,
	isMoveOut,
	isOffset,
	isPrior,
	isPriorDetach,
	isReturn,
	isRevert,
	isRevive,
	isSetValue,
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
	for (const baseMark of base) {
		ptr = rebaseOverMark(ptr, baseMark, context);
	}
}

function rebaseOverMark(startPtr: Pointer, baseMark: R.TraitMark, context: Context): Pointer {
	let ptr = startPtr;
	if (isBound(baseMark)) {
		ptr = ptr.insert(priorFromBound(baseMark, context));
	} else {
		while (ptr.mark !== undefined && isAttachSegment(ptr.mark)) {
			ptr = ptr.skipMarks(1);
		}
		if (ptr.mark === undefined || isBound(baseMark)) {
			ptr = insertPriorFromTraitMark(ptr, baseMark, context);
		} else {
			while (ptr.mark !== undefined && (isAttachSegment(ptr.mark) || isBound(ptr.mark))) {
				ptr = ptr.skipMarks(1);
			}
			const mark = ptr.mark;
			if (mark === undefined) {
				ptr = insertPriorFromTraitMark(ptr, baseMark, context);
			} else {
				if (isAttachSegment(baseMark)) {
					ptr = ptr.insert(lengthFromMark(baseMark));
				} else {
					ptr = ptr.ensureMarkStart();
					const baseMarkLength = lengthFromMark(baseMark);
					const markLength = lengthFromMark(mark);
					if (baseMarkLength < markLength) {
						ptr.seek(baseMarkLength).ensureMarkStart();
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
								type: "PriorDetach",
								seq: context.seq,
								length: baseMark.length,
							});
						} else if (isMoveOut(baseMark)) {
							ptr = ptr.replaceMark({
								type: "PriorDetach",
								seq: context.seq,
								length: baseMark.length,
							});
						} else if (isOffset(baseMark)) {
							ptr = ptr.seek(baseMarkLength);
						} else if (isRevive(baseMark)) {
							if (isPriorDetach(mark)) {
								ptr = ptr.replaceMark(markLength);
							} else {
								fail("A Revive segment should always match up with a PriorDetach segment");
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

type PriorTraitMark = R.Prior | R.Modify<R.Prior, false> | Offset;

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
			type: "PriorDetach",
			seq: context.seq,
			length: base.length,
		};
	}
	if (isMoveOut(base)) {
		return {
			type: "PriorDetach",
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
				type: "PriorSliceEnd",
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
