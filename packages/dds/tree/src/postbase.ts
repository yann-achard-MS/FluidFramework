/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Sequenced as S,
	Rebased as R,
	Offset,
	SeqNumber,
	TraitLabel,
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
	isMoveIn,
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

export function postbase(original: R.Transaction, base: S.Transaction): R.Transaction {
	return {
		ref: original.ref,
		newRef: base.seq,
		frames: original.frames.map((frame) => postbaseFrame(frame, original, base)),
	};
}

function postbaseFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.TransactionFrame {
	if (isConstraintFrame(frame)) {
		fail("Cannot postbase constraint frames");
	} else if (isChangeFrame(frame)) {
		return postbaseChangeFrame(frame, original, base);
	}
	fail("Transaction frame is neither a constraint nor a change");
}

function postbaseChangeFrame(
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
			postbaseOverFrame(newFrame, baseFrame, baseSeq);
		}
	}
	normalizeFrame(newFrame);
	return newFrame;
}

function postbaseOverFrame(
	orig: R.ChangeFrame,
	base: R.ChangeFrame,
	seq: SeqNumber,
): void {
	postbaseMarks(orig.marks, base.marks, { seq, base, moves: orig.moves }, undefined);
}

function postbaseMarks(
	curr: R.TraitMarks,
	base: R.TraitMarks,
	context: Context,
	parent: { label: TraitLabel; ptr: Pointer } | undefined,
): void {
	let ptr = Pointer.fromMarks(curr, parent);
	let iBaseMark = 0;
	while (iBaseMark < base.length) {
		const baseMark = base[iBaseMark];
		if (isStartBound(baseMark)) {
			const endIndex = findIndexFrom(
				base,
				iBaseMark + 1,
				(m) => isEnd(m) && m.op === baseMark.op,
			) ?? fail("Missing slice end");
			postbaseOverSlice(
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
			postbaseOverPriorSlice(
				ptr,
				baseMark,
				base[endIndex] as R.PriorRangeEnd,
				base.slice(iBaseMark + 1, endIndex),
				context,
			);
			iBaseMark = endIndex;
		} else {
			ptr = postbaseOverMark(ptr, baseMark, context);
		}
		iBaseMark += 1;
	}
	// We need to find all the remaining move sources or destinations and update their paths.
	// TODO: only do this if the number of added and removed nodes do not cancel-out.
}

function postbaseOverSlice(
	startPtr: Pointer,
	baseStart: R.MoveOutStart | R.DeleteStart,
	baseEnd: R.SliceEnd,
	slice: R.TraitMarks,
	context: Context,
): Pointer {
	let ptr = startPtr;
	ptr = ptr.insert(priorFromBound(baseStart, context));
	for (const baseMark of slice) {
		ptr = postbaseOverMark(ptr, baseMark, context);
	}
	ptr = ptr.insert(priorFromBound(baseEnd, context));
	return ptr;
}

function postbaseOverPriorSlice(
	startPtr: Pointer,
	baseStart: R.PriorDeleteStart | R.PriorMoveOutStart,
	baseEnd: R.PriorRangeEnd,
	slice: R.TraitMarks,
	context: Context,
): Pointer {
	let ptr = startPtr;
	ptr = ptr.insert(baseStart);
	for (const baseMark of slice) {
		ptr = postbaseOverMark(ptr, baseMark, context);
	}
	ptr = ptr.insert(baseEnd);
	return ptr;
}

function postbaseOverMark(
	startPtr: Pointer,
	baseMark: R.TraitMark,
	context: Context,
): Pointer {
	let ptr = startPtr;
	while (ptr.mark !== undefined && (isAttachSegment(ptr.mark) || isReviveSet(ptr.mark) || isReviveSlice(ptr.mark))) {
		const mark = ptr.mark;
		if (isMoveIn(mark)) {
			const moveEntry = (context.moves ?? fail("Missing move entry in frame"))[mark.id];
			moveEntry.dst = ptr.asDstPath();
		}
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
							ptr = postbaseOverMark(ptr, snd, context);
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
					ptr = postbaseOverMark(endPtr.skipMarks(1), baseMark, context);
				}
			} else {
				const baseMarkLength = lengthFromMark(baseMark);
				const markLength = lengthFromMark(mark);
				if (markLength === 0 || baseMarkLength === 0) {
					fail("Unexpected segment type");
				} else {
					if (baseMarkLength < markLength) {
						ptr.ensureMarkStart(baseMarkLength);
						ptr = postbaseOverMark(ptr, baseMark, context);
					} else if (baseMarkLength > markLength) {
						const [fst, snd] = splitMark(baseMark, markLength);
						ptr = postbaseOverMark(ptr, fst, context);
						ptr = postbaseOverMark(ptr, snd, context);
					} else {
						if (isModify(baseMark)) {
							if (isModify(mark)) {
								postbaseOverModify(mark, baseMark, context, ptr);
							} else if (isSetValue(mark)) {
								ptr = ptr.skipMarks(1);
							} else if (isDetachSegment(mark)) {
								const mods = mark.mods ?? [1];
								if (mark.mods !== undefined && isModify(mods[0])) {
									postbaseOverModify(mods[0], baseMark, context, ptr);
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

function postbaseOverModify(mark: R.Modify, baseMark: R.Modify, context: Context, ptr: Pointer): void {
	if (mark.modify === undefined) {
		mark.modify = {};
	}
	for (const [k,v] of Object.entries(baseMark.modify ?? {})) {
		if (k in mark.modify) {
			console.log(`Entering trait ${k}`);
			postbaseMarks(mark.modify[k], v, context, { label: k, ptr });
			console.log(`Exiting trait ${k}`);
		} else {
			// This branch is empty because we shouldn't need offsets or tombstones in traits
			// that the postbased change doesn't touch.
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
	readonly seq: SeqNumber;
	readonly base: R.ChangeFrame;
	readonly moves?: readonly R.MoveEntry[];
}
