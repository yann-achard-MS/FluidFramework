/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Squashed as Sq,
	Sequenced as S,
	Rebased as R,
	SeqNumber,
	ClientId,
} from "./format";
import { normalizeFrame } from "./normalize";
import {
	isChangeFrame,
} from "./utils";

export interface SeqMetadata {
	client: ClientId;
	ref: SeqNumber;
}

export type SeqMetadataMap = ReadonlyMap<SeqNumber, SeqMetadata>;

export function squash(
	changes: (S.Transaction | Sq.ChangeFrame)[],
): Sq.ChangeFrame {
	const frames: Sq.ChangeFrame[] = [];
	for (const change of changes) {
		if ("frames" in change) {
			frames.push(...change.frames
				.filter(isChangeFrame)
				.map((frame) => toSquashFrame(frame, change.seq, change.ref)));
		} else {
			frames.push(change);
		}
	}
	return squashFrames(frames);
}

export function toSquashFrame(frame: R.ChangeFrame, seq: SeqNumber, ref: SeqNumber): Sq.ChangeFrame {
	return {
		ref,
		minSeq: seq,
		maxSeq: seq,
		moves: frame.moves,
		marks: frame.marks,// .map((m) => squashMarkFromMark(m, seq)),
	};
}

export function squashFrames(
	frames: Sq.ChangeFrame[],
): Sq.ChangeFrame {
	assert(frames.length > 0, "No frames to squash");
	const moves: Sq.MoveEntry[] = [];
	const marks: Sq.Mark[] = [];
	let ref = frames[0].ref;
	const minSeq = frames[0].minSeq;
	const maxSeq = frames[frames.length - 1].maxSeq;

	for (const frame of frames) {
		// TODO
		ref = Math.min(ref, frame.ref);
	}

	const output = {
		moves,
		marks,
		ref,
		minSeq,
		maxSeq,
	};
	normalizeFrame(output);
	return output;
}

// class Pointer {
// 	/**
// 	 * The marks being pointed at.
// 	 */
// 	public readonly marks: Sq.TraitMarks;
// 	/**
// 	 * The index of the mark being pointed at within a list of marks.
// 	 * This index must be inferior *or equal* to the length of the list of marks.
// 	 */
// 	public readonly iMark: number;
// 	/**
// 	 * The index of the tree node being pointed at within the segment.
// 	 * This index must always be less than the length of the segment.
// 	 */
// 	public readonly iNode: number;
// 	/**
// 	 * The number of slices currently overlapping with the ptr position.
// 	 */
// 	public readonly inSlice: number;
// 	public readonly context: ReadContext;

// 	private constructor(
// 		marks: Sq.TraitMarks,
// 		iMark: number,
// 		iNode: number,
// 		inSlice: number,
// 		context: Readonly<ReadContext>,
// 	) {
// 		this.marks = marks;
// 		this.iMark = iMark;
// 		this.iNode = iNode;
// 		this.inSlice = inSlice;
// 		this.context = context;
// 	}

// 	public static fromMarks(marks: Sq.TraitMarks, context: Readonly<ReadContext>): Pointer {
// 		return new Pointer(marks, 0, 0, 0, context);
// 	}

// 	public get mark(): Sq.TraitMark | undefined {
// 		return this.marks[this.iMark];
// 	}

// 	public replaceMark(newMark: Sq.TraitMark): Pointer {
// 		assert(this.iNode === 0, "Only a whole mark can be replaced");
// 		assert(
// 			lengthFromMark(this.mark) === lengthFromMark(newMark),
// 			"A mark should only be replaced by a mark of the same length",
// 		);
// 		this.marks.splice(this.iMark, 1, newMark);
// 		return this.skipMarks(1);
// 	}

// 	public insert(newMark: Sq.TraitMark): Pointer {
// 		const ptr = this.ensureMarkStart();
// 		this.marks.splice(ptr.iMark, 0, newMark);
// 		return ptr.skipMarks(1);
// 	}

// 	/**
// 	 * @returns A Pointer to the location of the first node in the latter part of the split mark.
// 	 */
// 	public ensureMarkStart(): Pointer {
// 		if (this.iNode === 0) {
// 			return this;
// 		}
// 		const mark = this.mark;
// 		if (mark === undefined) {
// 			this.marks.push(this.iNode);
// 		} else {
// 			const mLength = lengthFromMark(mark);
// 			if (mLength !== this.iNode) {
// 				const markParts = splitMark(mark, this.iNode);
// 				this.marks.splice(this.iMark, 1, ...markParts);
// 			}
// 		}
// 		return this.seek(0);
// 	}

// 	public seek(nodeOffset: number): Pointer {
// 		return this.advance(nodeOffset);
// 	}

// 	public skipMarks(markCount: number): Pointer {
// 		const { marks, iMark, iNode, inSlice, context } = this;
// 		return new Pointer(marks, iMark + markCount, iNode, inSlice, context).seek(0);
// 	}

// 	private advance(nodeOffset: number): Pointer {
// 		assert(nodeOffset >= 0, "The offset must be >= to zero");
// 		let offset = nodeOffset;
// 		let { iMark, iNode, inSlice } = this;
// 		const { marks, context} = this;
// 		const markMax = marks.length;
// 		// Note that we use `>= 0` instead of `> 0`.
// 		// This ensures we skip over zero-length marks.
// 		while (offset >= 0 && iMark < markMax) {
// 			const mark = marks[iMark];
// 			// const isRelatedPrior =
// 			// 	isPrior(mark) &&
// 			// 	(context.ref <= -mark.seq);
// 			const invisible =
// 				false
// 				// isDelete(mark)
// 				// && mark.provision !== undefined
// 				// // If the provisional detach came about because of a seq that the current frame did not know about
// 				// && mark.provision.seq > context.frame.maxSeq
// 			;
// 			const nodeCount = invisible ? 0 : lengthFromMark(mark);
// 			if (iNode + offset >= nodeCount) {
// 				iMark += 1;
// 				offset -= nodeCount - iNode;
// 				iNode = 0;
// 				if (isBound(mark)) {
// 					if (isEnd(mark)) {
// 						assert(inSlice > 0, "Unbalanced slice bounds");
// 						inSlice -= 1;
// 					} else {
// 						inSlice += 1;
// 					}
// 				}
// 			} else {
// 				break;
// 			}
// 		}
// 		return new Pointer(marks, iMark, iNode + offset, inSlice, context);
// 	}
// }

// interface ReadContext {
// 	readonly frame: Sq.ChangeFrame;
// }

// interface Context extends ReadContext{
// 	readonly moves: R.MoveEntry[];
// 	readonly moveOffset: number;
// }

// function squashFrame(
// 	context: Context,
// 	marks: Sq.TraitMarks,
// 	frame: Sq.ChangeFrame,
// ): void {
// 	if (frame.moves !== undefined) {
// 		context.moves.push(...frame.moves);
// 	}
// 	squashMarks({...context, moveOffset: frame.moves?.length ?? 0}, marks, frame.marks);
// }

// function squashMarks(
// 	context: Context,
// 	marks: Sq.TraitMarks,
// 	newMarks: Sq.TraitMarks,
// ): void {
// 	let ptr: Pointer = Pointer.fromMarks(marks, context);
// 	ptr = ptr.seek(0);
// 	for (const newMark of newMarks) {
// 		ptr = squashMark(context, newMark, ptr);
// 	}
// }

// // function isProvisionMatch(p1: Sq.Provision | undefined, p2: Sq.Provision | undefined): boolean {
// // 	return p1 !== undefined && p2 !== undefined && p1.seq === p2.seq && p1.opId === p2.opId;
// // }

// function squashMark(
// 	context: Context,
// 	newMark: Sq.TraitMark,
// 	dst: Pointer,
// ): Pointer {
// 	let ptr: Pointer = dst;
// 	if (isOffset(newMark)) {
// 		ptr = ptr.seek(newMark);
// 	} else {
// 		if (ptr.mark === undefined) {
// 			ptr = ptr.insert(clone(newMark));
// 		} else {
// 			if (ptr.iNode > 0) {
// 				ptr = ptr.ensureMarkStart();
// 			}
// 			const newMarkLength = lengthFromMark(newMark);
// 			if (newMarkLength === 0) {
// 				ptr = ptr.insert(clone(newMark));
// 			} else {
// 				const mark = ptr.mark ?? fail("Unexpected missing mark");
// 				const markLength = lengthFromMark(mark);
// 				if (newMarkLength < markLength) {
// 					ptr.seek(newMarkLength).ensureMarkStart();
// 				} else if (newMarkLength > markLength) {
// 					const [fst, snd] = splitMark(newMark, markLength);
// 					ptr = squashMark(context, fst, ptr);
// 					ptr = squashMark(context, snd, ptr);
// 				} else {
// 					if (isAttachSegment(newMark)) {
// 						if (
// 							isInsert(newMark)
// 							&& isDelete(mark)
// 							// && isProvisionMatch(mark.provision, newMark.provision)
// 						) {
// 							ptr = ptr.replaceMark(newMarkLength);
// 						} else {
// 							// Inserting or moving-in. In a way that does not cancel out.
// 							ptr = ptr.insert(clone(newMark));
// 						}
// 					} else if (isPrior(newMark)) {
// 						if (isOffset(mark)) {
// 								if (ptr.inSlice > 0) {
// 									ptr = ptr.skipMarks(1);
// 								} else {
// 									ptr = ptr.insert(clone(newMark));
// 								}
// 						} else if (isPrior(mark)) {
// 							if (mark.seq === newMark.seq) {
// 								ptr = ptr.skipMarks(1);
// 							} else {
// 								ptr = ptr.insert(clone(newMark));
// 							}
// 						} else if (isDetachSegment(mark)) {
// 							ptr = ptr.skipMarks(1);
// 						} else {
// 							assert(false, "TODO: support other priors");
// 						}
// 					} else if (isSetValue(newMark) || isModify(newMark)) {
// 						if (isOffset(mark)) {
// 							ptr = ptr.replaceMark(clone(newMark));
// 						} else if (isSetValue(mark)) {
// 							ptr = ptr.replaceMark(clone(newMark));
// 						} else if (isModify(mark)) {
// 							if (newMark.value !== undefined) {
// 								mark.value = newMark.value;
// 							}
// 							if (isModify(newMark)) {
// 								const traitMods = mark.modify;
// 								if (traitMods !== undefined) {
// 									const newTraitMods = newMark.modify;
// 									if (newTraitMods !== undefined) {
// 										for (const [k,v] of Object.entries(newTraitMods)) {
// 											const traitMod = traitMods[k];
// 											if (traitMod === undefined) {
// 												traitMods[k] = clone(v);
// 											} else {
// 												squashMarks(context, traitMod, v);
// 											}
// 										}
// 									}
// 								} else {
// 									mark.modify = clone(newMark.modify);
// 								}
// 							}
// 						} else if (isInsert(mark)) {
// 							updateProtoNode(mark.content[ptr.iNode], newMark);
// 						} else if (isPrior(mark)) {
// 							if (mark.mods) {
// 								squashMark(context, newMark, Pointer.fromMarks(mark.mods, context));
// 							} else {
// 								mark.mods = ptr.iNode > 0 ? [ptr.iNode, newMark] : [newMark];
// 							}
// 						} else if (isMoveIn(mark)) {
// 							if (mark.mods) {
// 								squashMark(context, newMark, Pointer.fromMarks(mark.mods, context));
// 							} else {
// 								mark.mods = ptr.iNode > 0 ? [ptr.iNode, newMark] : [newMark];
// 							}
// 						} else if (isDelete(mark)) {
// 							// Ignore changes to deleted nodes
// 						} else if (isMoveOut(mark)) {
// 							assert(false, "TODO: support move");
// 						} else {
// 							assert(false, "TODO: support more types of marks");
// 						}
// 						ptr = ptr.seek(1);
// 					} else if (isBound(newMark)) {
// 						ptr = ptr.insert(clone(newMark));
// 					} else if (isDetachSegment(newMark)) {
// 						if (isMoveOut(newMark)) {
// 							assert(false, "TODO: support move-out");
// 						}
// 						ptr = ptr.replaceMark(clone(newMark));
// 					}
// 				}
// 			}
// 		}
// 	}
// 	return ptr;
// }

// function splitMark(mark: Readonly<Offset | Sq.Mark>, offset: number): [Offset | Sq.Mark, Offset | Sq.Mark] {
// 	if (isOffset(mark)) {
// 		return [offset, mark - offset];
// 	}
// 	if (offset === 0) {
// 		return [0, { ...mark }];
// 	}
// 	const mLength = lengthFromMark(mark);
// 	if (mLength === offset) {
// 		return [{ ...mark }, 0];
// 	}
// 	if (isSegment(mark) || isPrior(mark)) {
// 		if (isInsert(mark)) {
// 			return [
// 				{ ...mark, content: mark.content.slice(0, offset) },
// 				{ ...mark, content: mark.content.slice(offset) },
// 			];
// 		}
// 		if (mark.mods) {
// 			if (isPrior(mark)) {
// 				const mods = mark.mods;
// 				return [
// 					{ ...mark, length: offset,  mods: mods.slice(0, offset) },
// 					{ ...mark, length: mLength - offset, mods: mods.slice(offset) },
// 				];
// 			} else if (isDetachSegment(mark)) {
// 				const mods = mark.mods;
// 				return [
// 					{ ...mark, length: offset,  mods: mods.slice(0, offset) },
// 					{ ...mark, length: mLength - offset, mods: mods.slice(offset) },
// 				];
// 			} else {
// 				const mods = mark.mods;
// 				return [
// 					{ ...mark, length: offset,  mods: mods.slice(0, offset) },
// 					{ ...mark, length: mLength - offset, mods: mods.slice(offset) },
// 				];
// 			}
// 		}
// 		return [
// 			{ ...mark, length: offset },
// 			{ ...mark, length: mLength - offset },
// 		];
// 	} else {
// 		fail("TODO: support other mark types");
// 	}
// }

// function updateProtoNode(proto: Sq.ProtoNode, mod: Sq.SetValue | Sq.Modify): void {
// 	throw new Error("Function not implemented.");
// }
