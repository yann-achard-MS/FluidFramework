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
import { normalizeFrame } from "./normalize";
import {
	isAttachSegment,
	isBound,
	isChangeFrame,
	isDelete,
	isDetachSegment,
	isInsert,
	isModify,
	isMoveIn,
	isMoveOut,
	isOffset,
	isPrior,
	isSegment,
	isSetValue,
	lengthFromMark,
} from "./utils";

export function squash(transactions: S.Transaction[]): R.ChangeFrame {
	const moves: R.MoveEntry[] = [];
	const marks: R.Mark[] = [];

	for (const transaction of transactions) {
		const seq = transaction.seq;
		for (const frame of transaction.frames) {
			if (isChangeFrame(frame)) {
				squashFrame(
					{
						moves,
						moveOffset: 0,
						seq,
					},
					marks,
					frame,
				);
			}
		}
	}

	const output = {
		...(moves.length > 0 ? { moves } : {}),
		marks,
	};
	normalizeFrame(output);
	return output;
}

interface Pointer {
	/**
	 * The index of the mark being pointed at within a list of marks.
	 * This index must be inferior *or equal* to the length of the list of marks.
	 */
	iMark: number;
	/**
	 * The index of the tree node being pointed at within the segment.
	 * This index must always be less than the length of the segment.
	 */
	iNode: number;
	marks: R.TraitMarks;
}

interface Context {
	readonly moves: R.MoveEntry[];
	readonly moveOffset: number;
	readonly seq: SeqNumber;
}

function squashFrame(
	context: Context,
	marks: R.TraitMarks,
	frame: R.ChangeFrame,
	startOffset: number = 0,
): void {
	if (frame.moves !== undefined) {
		context.moves.push(...frame.moves);
	}
	squashMarks({...context, moveOffset: frame.moves?.length ?? 0}, marks, frame.marks, startOffset);
}

function squashMarks(
	context: Context,
	marks: R.TraitMarks,
	newMarks: R.TraitMarks,
	startOffset: number = 0,
): void {
	let ptr: Pointer = getPointer(marks, startOffset);
	for (const newMark of newMarks) {
		ptr = squashMark(context, newMark, ptr);
	}
}

function squashMark(
	context: Context,
	newMark: R.TraitMark,
	dst: Pointer,
): Pointer {
	const inverseSeq = -context.seq;
	const marks = dst.marks;
	let ptr: Pointer = dst;
	if (isOffset(newMark)) {
		ptr = advancePointer(ptr, newMark);
	} else {
		const mark = marks[ptr.iMark];
		if (mark === undefined) {
			// The pointer is targeting a location beyond the tail of the current marks list.
			if (ptr.iNode > 0) {
				// Ensure an offset is added if need be.
				marks.push(ptr.iNode);
				ptr.iNode = 0;
			}
			marks.push(newMark);
			ptr.iMark += 1;
		} else {
			const markLength = lengthFromMark(newMark);
			assert(markLength > 0, "Length-zero segments should be removed");
			if (isAttachSegment(newMark)) {
				const newMarkLength = lengthFromMark(newMark);
				if (isPrior(mark) && mark.seq === inverseSeq) {
					// We are squashing an insert on its inverse.
					if (ptr.iNode > 0) {
						// It's possible that only part of the insert survived the rebase.
						// TODO: determine whether we need to preserve the starting portion
						// of the  prior segment.
						ptr = ensureMarkStart(ptr);
					}
					if (newMarkLength >= markLength) {
						marks.splice(ptr.iMark, 1);
						if (newMarkLength > markLength) {
							// This can happen when other edits occur in the middle of the prior range.
							assert(false, "Todo");
						}
					} else {
						// Only part of the insert survived the rebase.
						ptr = ensureMarkStart({ iMark: ptr.iMark, iNode: newMarkLength, marks });
						marks.splice(ptr.iMark - 1, 1);
					}
				} else {
					// Inserting or moving-in. In a way that does not cancel out.
					ptr = ensureMarkStart(ptr);
					marks.splice(ptr.iMark, 0, newMark);
					ptr = advancePointer(ptr, newMarkLength);
				}
			} else if (isPrior(newMark)) {
				ptr = ensureMarkStart(ptr);
				marks.splice(ptr.iMark, 0, newMark);
				ptr.iMark += 1;
			} else if (isSetValue(newMark) || isModify(newMark)) {
				if (isOffset(mark)) {
					const remainder = mark - ptr.iNode - 1;
					ptr = ensureMarkStart(ptr);
					marks[ptr.iMark] = remainder;
					marks.splice(ptr.iMark, 0, newMark);
				} else if (isSetValue(mark)) {
					marks[ptr.iMark] = newMark;
				} else if (isModify(mark)) {
					if (newMark.value !== undefined) {
						mark.value = newMark.value;
					}
					if (isModify(newMark)) {
						const traitMods = mark.modify;
						if (traitMods !== undefined) {
							const newTraitMods = newMark.modify;
							if (newTraitMods !== undefined) {
								for (const [k,v] of Object.entries(newTraitMods)) {
									const traitMod = traitMods[k];
									if (traitMod === undefined) {
										traitMods[k] = v;
									} else {
										squashMarks(context, traitMod, v);
									}
								}
							}
						} else {
							mark.modify = newMark.modify;
						}
					}
				} else if (isInsert(mark)) {
					updateProtoNode(mark.content[ptr.iNode], newMark);
				} else if (isMoveIn(mark) || isPrior(mark)) {
					if (mark.mods) {
						squashMark(context, newMark, getPointer(mark.mods));
					} else {
						mark.mods = ptr.iNode > 0 ? [ptr.iNode, newMark] : [newMark];
					}
				} else if (isDelete(mark)) {
					// Ignore changes to deleted nodes
				} else if (isMoveOut(mark)) {
					assert(false, "TODO: support move");
				} else {
					assert(false, "TODO: support more types of marks");
				}
				ptr = advancePointer(ptr, 1);
			} else if (isBound(newMark)) {
					assert(false, "TODO: support slice marks");
			} else if (isDetachSegment(newMark)) {
				ptr = ensureMarkStart(ptr);
				if (isMoveOut(newMark)) {
					assert(false, "TODO: support move-out");
				}
				const newMarkLength = lengthFromMark(newMark);
				if (newMarkLength === markLength) {
					marks[ptr.iMark] = newMark;
					ptr = advancePointer(ptr, newMarkLength);
				} else if (newMarkLength < markLength) {
					const markIndex = ptr.iMark;
					ptr = ensureMarkStart(advancePointer(ptr, newMarkLength));
					marks[markIndex] = newMark;
				} else { // newMarkLength > markLength
					const [fst, snd] = splitMark(newMark, markLength);
					marks[ptr.iMark] = fst;
					ptr = advancePointer(ptr, markLength);
					ptr = squashMark(context, snd, ptr);
				}
			}
		}
	}
	return ptr;
}

/**
 * @param marks The array of mark where a mark is to be split. This array is mutated.
 * @param ptr The location at which to split the mark.
 * @returns A Pointer to the location of the first node in the latter part of the split mark.
 */
function ensureMarkStart(ptr: Readonly<Pointer>): Pointer {
	if (ptr.iNode === 0) {
		return ptr;
	}
	const mark = ptr.marks[ptr.iMark];
	if (mark === undefined) {
		ptr.marks.push(ptr.iNode);
	} else {
		const mLength = lengthFromMark(mark);
		if (mLength !== ptr.iNode) {
			const markParts = splitMark(mark, ptr.iNode);
			ptr.marks.splice(ptr.iMark, 1, ...markParts);
		}
	}
	return advancePointer(ptr, ptr.iNode);
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
	if (isSegment(mark) || isPrior(mark)) {
		if (isInsert(mark)) {
			return [
				{ ...mark, content: mark.content.slice(0, offset) },
				{ ...mark, content: mark.content.slice(offset) },
			];
		}
		if (mark.mods) {
			if (isDetachSegment(mark)) {
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
			{ ...mark, length: mLength },
		];
	} else {
		assert(false, "TODO: support other mark types");
	}
}

function getPointer(marks: R.TraitMarks, offset: number = 0): Pointer {
	return advancePointer({ iMark: 0, iNode: 0, marks }, offset);
}

function advancePointer(ptr: Readonly<Pointer>, offset: number): Pointer {
	assert(offset >= 0, "The offset must be >= to zero");
	let off = offset;
	let { iMark, iNode } = ptr;
	const { marks } = ptr;
	const markMax = marks.length;
	// Note that we use `>= 0` instead of `> 0`.
	// This ensures we skip over zero-length marks.
	while (off >= 0 && iMark < markMax) {
		const nodeCount = lengthFromMark(marks[iMark]);
		if (iNode + off >= nodeCount) {
			iMark += 1;
			off -= nodeCount - iNode;
			iNode = 0;
		} else {
			return { iMark, iNode: iNode + off, marks };
		}
	}
	return { iMark, iNode, marks };
}

function updateProtoNode(proto: R.ProtoNode, mod: R.SetValue | R.Modify): void {
	throw new Error("Function not implemented.");
}
