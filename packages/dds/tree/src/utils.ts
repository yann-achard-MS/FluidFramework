/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import structuredClone from "@ungap/structured-clone";
import { assert } from "@fluidframework/common-utils";
import {
	AffixCount,
	Effects,
	NodeCount,
	Offset,
	Original as O,
	Rebased as R,
	Sibling,
	TraitLabel,
	TreeChildPath,
	TreePath,
} from "./format";

export function clone<T>(original: T): T {
	return structuredClone(original) as T;
}

export function fail(message: string): never {
	throw new Error(message);
}

export function mapObject<T,U>(obj: T, f: (v: T[keyof T], k: keyof T) => U): ({ [K in keyof T]: U }) {
	const out: { [K in keyof T]?: U } = {};
	for (const [k,v] of Object.entries(obj)) {
		out[k] = f(v, k as keyof T);
	}
	return out as { [K in keyof T]: U };
}

export type OneOrMany<T> = T | T[];

export function isInsert(mark: Readonly<AffixCount | R.Attach>): mark is R.Insert {
	return typeof mark === "object" && "type" in mark && mark.type === "Insert";
}

export function isMoveIn(mark: Readonly<AffixCount | R.Attach>): mark is R.MoveIn {
	return typeof mark === "object" && "type" in mark && mark.type === "Move";
}

export function isModify(mark: Readonly<NodeCount | R.NodeMark>): mark is R.Modify {
	return typeof mark === "object"
		&& "type" in mark === false
		&& "priors" in mark === false;
}

export function isNewDetach(mark: Readonly<NodeCount | R.NodeMark>): mark is R.Detach {
	return typeof mark === "object"
	&& "type" in mark
	&& (mark.type === "Delete" || mark.type === "Move");
}

export function isReattach(mark: Readonly<NodeCount | R.NodeMark>): mark is R.Reattach {
	return typeof mark === "object"
	&& "type" in mark
	&& (mark.type === "Revive" || mark.type === "Return");
}

export function isConstraintFrame(frame: O.TransactionFrame | R.TransactionFrame): frame is R.ConstraintFrame {
	return Array.isArray(frame);
}

export function isChangeFrame(frame: O.TransactionFrame | R.TransactionFrame): frame is R.ChangeFrame {
	return !isConstraintFrame(frame);
}

export function lengthFromNodeMark(mark: Readonly<NodeCount | R.NodeMark>): number {
	if (mark === undefined) {
		return 0;
	}
	if (typeof mark === "number") {
		return mark;
	}
	if (isModify(mark)) {
		return 1;
	}
	return mark.count;
}

export function lengthFromOffsets(marks: Readonly<NodeCount | AffixCount | any>[] | undefined): number {
	let length = 0;
	if (marks !== undefined) {
		for (const mark of marks) {
			if (typeof mark === "number") {
				length += mark;
			}
		}
	}
	return length;
}

// export class Pointer {
// 	/**
// 	 * The marks being pointed at.
// 	 */
// 	public readonly marks: R.TraitMarks;
// 	/**
// 	 * The index of the mark being pointed at within a list of marks.
// 	 * This index must be inferior *or equal* to the length of the list of marks.
// 	 */
// 	public readonly iMark: number;

// 	public readonly srcSide: Sibling;
// 	public readonly iSrcNode: number;
// 	public readonly iDstNode: number;
// 	/**
// 	 * The slices that the pointer is currently iterating over (if any).
// 	 */
// 	public readonly rangeStack: readonly (R.DetachMark | R.PriorDetach)[];

// 	public readonly parent?: { label: TraitLabel; ptr: Pointer };

// 	private constructor(
// 		marks: R.TraitMarks,
// 		iMark: number,
// 		srcSide: Sibling,
// 		iSrcNode: number,
// 		iDstNode: number,
// 		rangeStack: readonly (R.DetachMark | R.PriorDetach)[],
// 		parent: { label: TraitLabel; ptr: Pointer } | undefined,
// 	) {
// 		this.marks = marks;
// 		this.iMark = iMark;
// 		this.srcSide = srcSide;
// 		this.iSrcNode = iSrcNode;
// 		this.iDstNode = iDstNode;
// 		this.rangeStack = rangeStack;
// 		this.parent = parent;
// 	}

// 	public static fromMarks(
// 		marks: R.TraitMarks,
// 		parent?: { label: TraitLabel; ptr: Pointer },
// 	): Pointer {
// 		return new Pointer(
// 			marks,
// 			0,
// 			Sibling.Prev,
// 			0,
// 			0,
// 			[],
// 			parent,
// 		);
// 	}

// 	public get mark(): R.TraitMark | undefined {
// 		return this.marks[this.iMark];
// 	}

// 	public deleteMarks(markCount: number): Pointer {
// 		this.marks.splice(this.iMark, markCount);
// 		return this;
// 	}

// 	public replaceMark(newMark: R.TraitMark): Pointer {
// 		this.marks.splice(this.iMark, 1, newMark);
// 		return this.skipMarks(1);
// 	}

// 	public insert(newMark: R.TraitMark): Pointer {
// 		this.marks.splice(this.iMark, 0, newMark);
// 		return this.skipMarks(1);
// 	}

// 	/**
// 	 * @returns A Pointer to the location of the first node in the latter part of the mark being split.
// 	 */
// 	public ensureMarkStart(nodeOffset: number): Pointer {
// 		let remaining = nodeOffset;
// 		let ptr: Pointer = this.skipMarks(0);
// 		while (remaining > 0) {
// 			const mark = ptr.mark;
// 			if (mark === undefined) {
// 				return ptr.insert(nodeOffset);
// 			}
// 			const mLength = lengthFromNodeMark(mark);
// 			if (remaining < mLength) {
// 				if (isNodeMark(mark)) {
// 					fail("Only length>1 marks should be split");
// 				}
// 				const markParts = splitMark(mark, remaining);
// 				this.marks.splice(ptr.iMark, 1, ...markParts);
// 				return this.skipMarks(1);
// 			}
// 			ptr = ptr.skipMarks(1);
// 			remaining -= mLength;
// 		}
// 		return ptr;
// 	}

// 	public asSrcPath(tail?: TreeChildPath): TreePath {
// 		const selfAndTail = tail === undefined ? this.iSrcNode : { [this.iSrcNode]: tail };
// 		if (this.parent === undefined) {
// 			return selfAndTail;
// 		}
// 		return this.parent.ptr.asSrcPath({ [this.parent.label]: selfAndTail });
// 	}

// 	public asDstPath(tail?: TreeChildPath): TreePath {
// 		const selfAndTail = tail === undefined ? this.iDstNode : { [this.iDstNode]: tail };
// 		if (this.parent === undefined) {
// 			return selfAndTail;
// 		}
// 		return this.parent.ptr.asDstPath({ [this.parent.label]: selfAndTail });
// 	}

// 	public skipMarks(markCount: number): Pointer {
// 		const { marks, iMark, srcSide, iSrcNode, iDstNode, rangeStack, parent } = this;
// 		const stack = [...rangeStack];
// 		let srcOffset = 0;
// 		let dstOffset = 0;
// 		const iTarget = iMark + markCount;
// 		assert(iTarget <= marks.length, "Cannot skip non-existent marks");
// 		for (let idx = iMark; idx < iTarget; idx += 1) {
// 			const mark = marks[idx];
// 			const length = lengthFromNodeMark(mark);
// 			if (isAttachSegment(mark)) {
// 				dstOffset += length;
// 				if (isRevive(mark)) {
// 					srcOffset += length;
// 				}
// 			} else if (isDetachSegment(mark)) {
// 				srcOffset += length;
// 			} else if (isNumber(mark)) {
// 				const slice = stack[stack.length - 1];
// 				if (slice === undefined) {
// 					dstOffset += length;
// 					srcOffset += length;
// 				} else if (isPrior(slice)) {
// 					// Nothing?
// 				} else {
// 					srcOffset += length;
// 				}
// 			}
// 		}
// 		return new Pointer(marks, iTarget, srcSide, iSrcNode + srcOffset, iDstNode + dstOffset, stack, parent);
// 	}
// }

// export function splitMark(
// 	mark: Offset | Readonly<R.SegmentMark>,
// 	offset: number,
// ): [Offset | R.SegmentMark, Offset | R.SegmentMark] {
// 	if (offset === 0) {
// 		fail("Cannot split a mark with an offset of 0");
// 	}
// 	if (isNumber(mark)) {
// 		return [offset, mark - offset];
// 	}
// 	if (isAttachSegment(mark)) {
// 		fail("Cannot split an attach mark");
// 	}
// 	const mLength = lengthFromNodeMark(mark);
// 	if (mLength === offset) {
// 		return [{ ...mark }, 0];
// 	}
// 	if (isSegment(mark)) {
// 		// TODO: This is no longer valid since not all mods are of length 1 anymore
// 		const mark1 = { ...mark, length: offset, mods: [...(mark.mods?.slice(0, offset) ?? []) ] };
// 		const mark2 = { ...mark, length: mLength - offset, mods: [...(mark.mods?.slice(offset) ?? []) ] };
// 		// TODO: figure out why the cast is needed
// 		return [mark1, mark2] as [Offset | R.SegmentMark, Offset | R.SegmentMark];
// 	} else {
// 		fail("TODO: support other mark types");
// 	}
// }

export function neverCase(never: never): never {
	fail("neverCase was called");
}

export function findIndexFrom<T>(
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

export function commutesWithDelete(mark: { commute?: Effects }): boolean {
	return mark.commute === undefined
	|| mark.commute === Effects.All
	|| mark.commute === Effects.Delete
	;
}

export function identity<T>(t: T): T {
	return t;
}
