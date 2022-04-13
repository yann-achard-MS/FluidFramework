/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Sequenced as S,
	Rebased as R,
	SeqNumber,
} from "./format";
import { normalizeFrame } from "./normalize";
import {
	clone,
	fail,
	isRevive,
	isAttachSegment,
	isChangeFrame,
	isConstraintFrame,
	Pointer,
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
					newFrame.priorMoves = [];
				}
				const priorMoves: R.PriorMoveEntry[] = baseFrame.moves.map((mv) => ({ ...mv, seq: baseSeq }));
				newFrame.priorMoves.push(...priorMoves);
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
		ptr = rebaseOverMark(ptr, baseMark, context);
		iBaseMark += 1;
	}
}

function rebaseOverMark(
	startPtr: Pointer,
	baseMark: R.TraitMark,
	context: Context,
): Pointer {
	let ptr = startPtr;
	while (ptr.mark !== undefined && (isAttachSegment(ptr.mark) || isRevive(ptr.mark))) {
		ptr = ptr.skipMarks(1);
	}
	return ptr;
}

// function rebaseOverModify(mark: R.Modify, baseMark: R.Modify, context: Context): void {
// 	if (mark.modify === undefined) {
// 		mark.modify = {};
// 	}
// 	for (const [k,v] of Object.entries(baseMark.modify ?? {})) {
// 		if (k in mark.modify) {
// 			console.log(`Entering trait ${k}`);
// 			rebaseMarks(mark.modify[k], v, context);
// 			console.log(`Exiting trait ${k}`);
// 		} else {
// 			// The line below is disabled because we shouldn't need priors in traits
// 			// that the rebased change doesn't touch. Note that it's still an open
// 			// question of whether that's still true in the case of slice moves (see scenario G).
// 			// mark.modify[k] = priorsFromTraitMarks([], v, context);
// 		}
// 	}
// }

// type PriorTraitMark = R.PriorBound | R.Modify<R.PriorBound, false> | Offset;

// function priorsFromModify(modify: R.Modify, context: Context): R.Modify<PriorTraitMark, false> {
// 	const mods = modify.modify;
// 	if (mods === undefined) {
// 		return {};
// 	}
// 	return {
// 		modify: mapObject(mods, (marks) => priorsFromTraitMarks([], marks, context)),
// 	};
// }

// function priorsFromTraitMarks(
// 	marks: PriorTraitMark[],
// 	baseMarks: R.TraitMarks,
// 	context: Context,
// ): PriorTraitMark[] {
// 	for (const baseMark of baseMarks) {
// 		const newMark = priorFromTraitMark(baseMark, context);
// 		if (newMark !== undefined) {
// 			marks.push();
// 		}
// 	}
// 	return marks;
// }

// function insertPriorFromTraitMark(
// 	ptr: Pointer,
// 	baseMark: R.TraitMark,
// 	context: Context,
// ): Pointer {
// 	const newMark = priorFromTraitMark(baseMark, context);
// 	if (newMark !== undefined) {
// 		return ptr.insert(newMark);
// 	}
// 	return ptr;
// }

// function priorFromTraitMark(
// 	base: R.TraitMark,
// 	context: Context,
// ): PriorTraitMark | undefined {
// 	if (isModify(base)) {
// 		return priorsFromModify(base, context);
// 	}
// 	if (isDeleteSet(base)) {
// 		return {
// 			type: "PriorSetDetachStart",
// 			seq: context.seq,
// 			length: base.length,
// 		};
// 	}
// 	if (isMoveOutSet(base)) {
// 		return {
// 			type: "PriorSetDetachStart",
// 			seq: context.seq,
// 			length: base.length,
// 		};
// 	}
// 	if (isOffset(base) || isAttachSegment(base) || isRevert(base)) {
// 		return lengthFromMark(base);
// 	}
// 	if (isPrior(base) || isSetValue(base)) {
// 		return undefined;
// 	}
// 	fail("Unexpected mark type");
// }

function rebaseConstraintFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.ConstraintFrame {
	fail("Function not implemented.");
}

interface Context {
	seq: SeqNumber;
	base: R.ChangeFrame;
}
