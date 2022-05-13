/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Sequenced as S,
	Rebased as R,
	SeqNumber,
	Effects,
	Sibling,
} from "./format";
import { normalizeFrame } from "./normalize";
import {
	clone,
	fail,
	isAttachSegment,
	isChangeFrame,
	isConstraintFrame,
	Pointer,
	isNumber,
	isInsert,
	isDeleteSet,
	isDeleteSlice,
	commutesWithDelete,
	isModify,
	isSetValue,
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
	baseSeq: SeqNumber,
): void {
	rebaseMarks(orig.marks, base.marks, { baseSeq, base });
}

function rebaseMarks(
	curr: R.TraitMarks,
	base: R.TraitMarks,
	context: Context,
): void {
	let currPtr = Pointer.fromMarks(curr);
	let basePtr = Pointer.fromMarks(base);
	basePtr = basePtr.nextMark();
	while (basePtr.mark !== undefined) {
		const baseMark = basePtr.mark;
		if (isNumber(baseMark)) {
			fail("seekToBaseAnchor should skip offsets");
		}
		if (isModify(baseMark)) {
			let spanPtr = currPtr.seekToNodeSpan(basePtr);
			const currMark = spanPtr.mark;
			if (isModify(currMark)) {
				rebaseOverModify(currMark, baseMark, context);
				currPtr = spanPtr.after();
			} else {
				// Do nothing
			}
		} else if (isInsert(baseMark)) {
			currPtr.insert({
				type: "PriorInsert",
				seq: context.baseSeq,
				id: baseMark.id,
				length: baseMark.content.length,
				commute: baseMark.heed,
			});
		} else if (isDeleteSet(baseMark)) {
			currPtr = currPtr.colonize(baseMark.length ?? 1, Sibling.Prev);
		} else if (isDeleteSlice(baseMark)) {
			currPtr = currPtr.colonize(
				baseMark.length ?? 1,
				baseMark.endsSide ?? Sibling.Next,
			);
		}
		basePtr = basePtr.nextMark();
	}
}

/**
 * There's value in being able to see where a src location is within a changeset
 * so we want to allow pointers to have a node offset within a mark
 *
 * Should locations in changesets be node indices? Or should they be anchor points?
 * We need to deal with anchor points so perhaps that the right choice.
 * Note: several segment could be competing for the same anchor point.
 * It seems we need both: NodeMark_s target nodes
 *
 * Should we use a 2-pointer system for range edits?
 * What about for NodeMark-related edits?
 *
 * We're going to want to keep the currPtr and the basePtr in sync so it seems
 * valuable to make a construct for that.
 *
 * Insertions will lead to injections (of offsets or prior insert)
 * Revives will be converted to offsets
 * Range ops will
 *   possibly make some inserts disappear
 *   replace offsets either on the main line or within segments
 */

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

function priorFromTraitMark(
	base: R.TraitMark,
	context: Context,
): PriorTraitMark | undefined {
	if (isModify(base)) {
		return priorsFromModify(base, context);
	}
	if (isDeleteSet(base)) {
		return {
			type: "PriorSetDetachStart",
			seq: context.seq,
			length: base.length,
		};
	}
	if (isMoveOutSet(base)) {
		return {
			type: "PriorSetDetachStart",
			seq: context.seq,
			length: base.length,
		};
	}
	if (isNumber(base) || isAttachSegment(base) || isRevert(base)) {
		return lengthFromMark(base);
	}
	if (isPrior(base) || isSetValue(base)) {
		return undefined;
	}
	fail("Unexpected mark type");
}

function rebaseConstraintFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.ConstraintFrame {
	fail("Function not implemented.");
}

interface Context {
	baseSeq: SeqNumber;
	base: R.ChangeFrame;
}
