/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Sequenced as S,
	Rebased as R,
	Offset,
	SeqNumber,
} from "./format";
import {
	clone,
	fail,
	isAttachSegment,
	isBound,
	isChangeFrame,
	isConstraintFrame,
	isDelete,
	isDetachSegment,
	isEnd,
	isInsert,
	isModify,
	isMoveOut,
	isOffset,
	isPrior,
	isPriorDetach,
	isReturn,
	isRevert,
	isRevive,
	isSegment,
	isSetValue,
	lengthFromMark,
	mapObject,
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
	// const sameClient = originalTransaction.client === baseTransaction.client;

	const frameToFrame = (
		orig: R.ChangeFrame,
		base: R.ChangeFrame,
		seq: SeqNumber,
	): void => {
		marksToMarks(orig.marks, base.marks, { seq, sliceIdOffset: orig.moves?.length ?? 0 });
	};

	const newFrame: R.ChangeFrame = clone(frameToRebase);
	for (const baseFrame of baseTransaction.frames) {
		if (isChangeFrame(baseFrame)) {
			frameToFrame(newFrame, baseFrame, baseSeq);
		}
	}
	return newFrame;
}

function marksToMarks(
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
				} else if (baseMarkLength > markLength) {
					const [fst, snd] = splitMark(baseMark, markLength);
					ptr = rebaseOverMark(ptr, fst, context);
					ptr = rebaseOverMark(ptr, snd, context);
				} else {
					if (isModify(baseMark)) {
						if (isModify(mark)) {
							rebaseOverModify(mark, baseMark, context);
						} else if (isSetValue(mark)) {
							const mod: R.Modify = {
								value: mark.value,
								modify: priorsFromModify(baseMark, context).modify,
							};
							ptr = ptr.replaceMark(mod);
						} else if (isDetachSegment(mark)) {
							const mods = mark.mods ?? [1];
							if (mark.mods === undefined) {
								mark.mods = mods;
							}
							const mod = mods[0];
							if (mod === undefined || isOffset(mod)) {
								mods[0] = {
									modify: priorsFromModify(baseMark, context).modify,
								};
							} else {
								assert(isModify(mod), "Expected Modify mark");
								rebaseOverModify(mod, baseMark, context);
							}
							ptr = ptr.skipMarks(1);
						} else {
							fail("Unexpected segment type");
						}
					} else if (isDelete(baseMark) || isMoveOut(baseMark)) {
						ptr = ptr.insert({
							type: "PriorDetach",
							seq: context.seq,
							...optLength(baseMark),
						});
					} else if (isOffset(baseMark)) {
						ptr.seek(baseMarkLength);
					} else {
						ptr = insertPriorFromTraitMark(ptr, baseMark, context);
					}
				}
			}
		}
	}
	return ptr;
}

function rebaseOverModify(mark: R.Modify, baseMark: R.Modify, context: Context): void {
	for (const [k,v] of Object.entries(baseMark.modify ?? {})) {
		if (k in mark) {
			marksToMarks(mark[k], v, context);
		} else {
			mark[k] = priorsFromTraitMarks([], v, context);
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
	if (isDelete(base) || isMoveOut(base)) {
		return {
			type: "PriorDetach",
			seq: context.seq,
			...optLength(base),
		};
	}
	if (isOffset(base) || isAttachSegment(base) || isReturn(base) || isRevive(base) || isRevert(base)) {
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

function optLength<T extends { length?: number; }>(input: T): ({ length?: number; }) {
	if (input.length !== undefined && input.length !== 1) {
		return { length: input.length };
	}
	return {};
}

function rebaseConstraintFrame(
	frame: R.TransactionFrame,
	original: R.Transaction,
	base: S.Transaction,
): R.ConstraintFrame {
	fail("Function not implemented.");
}

interface Context {
	seq: SeqNumber;
	sliceIdOffset: number;
}

class Pointer {
	/**
	 * The marks being pointed at.
	 */
	public readonly marks: R.TraitMarks;
	/**
	 * The index of the mark being pointed at within a list of marks.
	 * This index must be inferior *or equal* to the length of the list of marks.
	 */
	public readonly iMark: number;
	/**
	 * The index of the tree node being pointed at within the segment.
	 * This index must always be less than the length of the segment.
	 */
	public readonly iNode: number;
	/**
	 * The number of slices currently overlapping with the ptr position.
	 */
	public readonly inSlice: number;
	// public readonly context: ReadContext;

	private constructor(
		marks: R.TraitMarks,
		iMark: number,
		iNode: number,
		inSlice: number,
		// context: Readonly<ReadContext>,
	) {
		this.marks = marks;
		this.iMark = iMark;
		this.iNode = iNode;
		this.inSlice = inSlice;
		// this.context = context;
	}

	public static fromMarks(
		marks: R.TraitMarks,
		// context: Readonly<ReadContext>,
	): Pointer {
		return new Pointer(
			marks,
			0,
			0,
			0,
			// context
		);
	}

	public get mark(): R.TraitMark | undefined {
		return this.marks[this.iMark];
	}

	public replaceMark(newMark: R.TraitMark): Pointer {
		assert(this.iNode === 0, "Only a whole mark can be replaced");
		assert(
			lengthFromMark(this.mark) === lengthFromMark(newMark),
			"A mark should only be replaced by a mark of the same length",
		);
		this.marks.splice(this.iMark, 1, newMark);
		return this.skipMarks(1);
	}

	public insert(newMark: R.TraitMark): Pointer {
		const ptr = this.ensureMarkStart();
		this.marks.splice(ptr.iMark, 0, newMark);
		return ptr.skipMarks(1);
	}

	/**
	 * @returns A Pointer to the location of the first node in the latter part of the split mark.
	 */
	public ensureMarkStart(): Pointer {
		if (this.iNode === 0) {
			return this;
		}
		const mark = this.mark;
		if (mark === undefined) {
			this.marks.push(this.iNode);
		} else {
			const mLength = lengthFromMark(mark);
			if (mLength !== this.iNode) {
				const markParts = splitMark(mark, this.iNode);
				this.marks.splice(this.iMark, 1, ...markParts);
			}
		}
		return this.seek(0);
	}

	public seek(nodeOffset: number): Pointer {
		return this.advance(nodeOffset);
	}

	public skipMarks(markCount: number): Pointer {
		const { marks, iMark, inSlice } = this;
		return new Pointer(marks, iMark + markCount, 0, inSlice).seek(0);
	}

	private advance(nodeOffset: number): Pointer {
		assert(nodeOffset >= 0, "The offset must be >= to zero");
		let offset = nodeOffset;
		let { iMark, iNode, inSlice } = this;
		const { marks } = this;
		const markMax = marks.length;
		// Note that we use `>= 0` instead of `> 0`.
		// This ensures we skip over zero-length marks.
		while (offset >= 0 && iMark < markMax) {
			const mark = marks[iMark];
			const nodeCount = lengthFromMark(mark);
			if (iNode + offset >= nodeCount) {
				iMark += 1;
				offset -= nodeCount - iNode;
				iNode = 0;
				if (isBound(mark)) {
					if (isEnd(mark)) {
						assert(inSlice > 0, "Unbalanced slice bounds");
						inSlice -= 1;
					} else {
						inSlice += 1;
					}
				}
			} else {
				break;
			}
		}
		return new Pointer(
			marks,
			iMark,
			iNode + offset,
			inSlice,
			// context
		);
	}
}

function splitMark(mark: Readonly<Offset | R.Mark>, offset: number): [Offset | R.Mark, Offset | R.Mark] {
	if (isOffset(mark)) {
		return [offset, mark - offset];
	}
	if (offset === 0) {
		return [0, { ...mark }];
	}
	const mLength = lengthFromMark(mark);
	if (mLength === offset) {
		return [{ ...mark }, 0];
	}
	if (isSegment(mark) || isPriorDetach(mark)) {
		if (isInsert(mark)) {
			return [
				{ ...mark, content: mark.content.slice(0, offset) },
				{ ...mark, content: mark.content.slice(offset) },
			];
		}
		if (mark.mods) {
			if (isPriorDetach(mark)) {
				const mods = mark.mods;
				return [
					{ ...mark, length: offset,  mods: mods.slice(0, offset) },
					{ ...mark, length: mLength - offset, mods: mods.slice(offset) },
				];
			} else if (isDetachSegment(mark)) {
				const mods = mark.mods;
				return [
					{ ...mark, length: offset,  mods: mods.slice(0, offset) },
					{ ...mark, length: mLength - offset, mods: mods.slice(offset) },
				];
			} else {
				const mods = mark.mods;
				return [
					{ ...mark, length: offset,  mods: mods.slice(0, offset) },
					{ ...mark, length: mLength - offset, mods: mods.slice(offset) },
				];
			}
		}
		return [
			{ ...mark, length: offset },
			{ ...mark, length: mLength - offset },
		];
	} else {
		fail("TODO: support other mark types");
	}
}

function priorFromBound(bound: R.SliceBound, context: Context): R.PriorSlice {
	switch (bound.type) {
		case "DeleteStart": {
			return {
				type: "PriorDeleteStart",
				seq: context.seq,
				op: bound.op + context.sliceIdOffset,
			};
		}
		case "MoveOutStart": {
			return {
				type: "PriorMoveOutStart",
				seq: context.seq,
				op: bound.op + context.sliceIdOffset,
			};
		}
		case "End": {
			return {
				type: "PriorSliceEnd",
				op: bound.op + context.sliceIdOffset,
			};
		}
		default: fail("Unexpected bound type");
	}
}
