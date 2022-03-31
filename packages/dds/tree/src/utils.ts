/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import structuredClone from "@ungap/structured-clone";
import { assert } from "@fluidframework/common-utils";
import {
	Offset,
	Original as O,
	Rebased as R,
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

// type Wrap<T> = { o: T } extends any ? { o: T } : never;
// type Unwrap<T> = T extends { o: infer U } ? U : never;

// type A = { a: number } & { ab: number };
// type B = { ab: string } & { b: string };
// type AB = A | B;
// // type CD = A & B;

// type CD = {
// 	[P in keyof (A & B)]?: A extends { P: infer AP }
// 		? (B extends { P: infer BP } ? AP | BP : AP)
// 		: (B extends { P: infer BP } ? BP : never)
// };
// // type CD = {
// // 	[P in keyof (A & B)]?: A extends { P: infer AP }
// // 		? (B extends { P: infer BP } ? AP | BP : AP)
// // 		: (B extends { P: infer BP } ? BP : never)
// // };

// const ab: AB = { a: 1, ab: 1, b: "" };
// const cd: CD = ab;
// const n: number = cd.a;

// /**
//  * Source: https://fettblog.eu/typescript-union-to-intersection/
//  */
// export type UnionToIntersection<T> =
// 	(T extends any ? (x: T) => any : never) extends
// 	(x: infer R) => any ? R : never;

// export type PartialUnion<T> = UnionToIntersection<Partial<T>>;

export type OneOrMany<T> = T | T[];

// export type VisitOutput = boolean | undefined | void;

// export interface RebasedFrameVisitor {
// 	readonly onChange?: (frame: R.ChangeFrame) => VisitOutput;
// 	readonly onConstraint?: (frame: R.ConstraintFrame) => VisitOutput;

// 	readonly onMark?: (mark: R.Mark) => VisitOutput;
// 	readonly onObjMark?: (mark: R.ObjMark) => VisitOutput;
// 	readonly onNode?: (node: R.ProtoNode) => VisitOutput;

// 	readonly onSegment?: (mark: R.SegmentMark) => VisitOutput;
// 	readonly onMod?: (mark: R.ModsMark) => VisitOutput;
// 	readonly onAttach?: (mark: R.AttachMark) => VisitOutput;
// 	readonly onDetach?: (mark: R.DetachMark) => VisitOutput;
// 	readonly onBound?: (mark: R.SliceBound) => VisitOutput;
// 	readonly onStartBound?: (mark: R.SliceStart) => VisitOutput;

// 	readonly onModify?: (mark: R.Modify) => VisitOutput;
// 	readonly onSetValue?: (mark: R.SetValue) => void;
// 	readonly onInsert?: (mark: R.Insert) => VisitOutput;
// 	readonly onDelete?: (mark: R.Delete) => VisitOutput;
// 	readonly onMoveIn?: (mark: R.MoveIn) => VisitOutput;
// 	readonly onMoveOut?: (mark: R.MoveOut) => VisitOutput;
// 	readonly onMoveOutStart?: (mark: R.MoveOutStart) => void;
// 	readonly onDeleteStart?: (mark: R.DeleteStart) => void;
// 	readonly onSliceEnd?: (mark: R.SliceEnd) => void;
// 	readonly onOffset?: (mark: Offset) => void;
// }

// export function visitFrame(
// 	frame: R.ChangeFrame | R.ConstraintFrame,
// 	visitor: RebasedFrameVisitor,
// ): void {
// 	if (isChangeFrame(frame)) {
// 		const skip = visitor.onChange?.(frame);
// 		if (skip !== false) {
// 			visitChangeFrame(frame, visitor);
// 		}
// 	} else if (isConstraintFrame(frame)) {
// 		visitor.onConstraint?.(frame);
// 	} else {
// 		throw(new Error("Transaction frame is neither a constraint nor a change"));
// 	}
// }

// export function visitChangeFrame(changeFrame: R.ChangeFrame, visitor: RebasedFrameVisitor): void {
// 	visitMarks(changeFrame.marks, visitor);
// }

// export function visitMarks(marks: (Offset | R.ObjMark)[], visitor: RebasedFrameVisitor): void {
// 	for (const mark of marks) {
// 		visitMark(mark, visitor);
// 	}
// }

// export function visitMods(
// 	marks: (Offset | R.ModsMark)[],
// 	visitor: RebasedFrameVisitor,
// ): void {
// 	for (const mark of marks) {
// 		visitMark(mark, visitor);
// 	}
// }

// export function visitMark(
// 	mark: Offset | R.Mark,
// 	visitor: RebasedFrameVisitor,
// ): void {
// 	if (typeof mark === "number") {
// 		visitor.onOffset?.(mark);
// 	} else if (typeof mark === "object") {
// 		const skipMark = visitor.onMark?.(mark);
// 		if (skipMark !== false) {
// 			if (Array.isArray(mark)) {
// 				// TODO: racing
// 			} else {
// 				const skipObjMark = visitor.onObjMark?.(mark);
// 				if (skipObjMark !== false) {
// 					if (isModify(mark)) {
// 						const skipMod = visitor.onMod?.(mark);
// 						if (skipMod !== false) {
// 							const skipModify = visitor.onModify?.(mark);
// 							if (skipModify !== false) {
// 								if (mark.modify !== undefined) {
// 									for (const modifyOrMarks of Object.values(mark.modify)) {
// 										visitMarks(modifyOrMarks, visitor);
// 									}
// 								}
// 							}
// 						}
// 					} else if (isSetValue(mark)) {
// 						const skipMod = visitor.onMod?.(mark);
// 						if (skipMod !== false) {
// 							visitor.onSetValue?.(mark);
// 						}
// 					} else if (isBound(mark)) {
// 						const skipBound = visitor.onBound?.(mark);
// 						if (skipBound !== false) {
// 							if (isEnd(mark)) {
// 								visitor.onSliceEnd?.(mark);
// 							} else {
// 								const skipStart = visitor.onStartBound?.(mark);
// 								if (skipStart !== false) {
// 									if (isMoveOutStart(mark)) {
// 										visitor.onMoveOutStart?.(mark);
// 									} else {
// 										visitor.onDeleteStart?.(mark);
// 									}
// 								}
// 							}
// 						}
// 					} else if (isSegment(mark)) {
// 						const skipSegment = visitor.onSegment?.(mark);
// 						if (skipSegment !== false) {
// 							if (isDetachSegment(mark)) {
// 								const skipDetach = visitor.onDetach?.(mark);
// 								if (skipDetach !== false) {
// 									if (mark.type === "Delete") {
// 										const skipDelete = visitor.onDelete?.(mark);
// 										if (skipDelete !== false && mark.mods !== undefined) {
// 											visitMods(mark.mods, visitor);
// 										}
// 									} else {
// 										const skipMoveOut = visitor.onMoveOut?.(mark);
// 										if (skipMoveOut !== false && mark.mods !== undefined) {
// 											visitMods(mark.mods, visitor);
// 										}
// 									}
// 								}
// 							} else {
// 								const skipAttach = visitor.onAttach?.(mark);
// 								if (skipAttach !== false) {
// 									if (mark.type === "Insert") {
// 										const skipInsert = visitor.onInsert?.(mark);
// 										if (skipInsert !== false && mark.mods !== undefined) {
// 											visitMods(mark.mods, visitor);
// 										}
// 									} else {
// 										const skipMoveIn = visitor.onMoveIn?.(mark);
// 										if (skipMoveIn !== false) {
// 											visitMarks(mark.content, visitor);
// 										}
// 									}
// 								}
// 							}
// 						}
// 					}
// 				}
// 			}
// 		}
// 	}
// }

export function isSetValue(mark: Offset | R.ObjMark): mark is R.SetValue {
	return typeof mark === "object" && mark.type === "SetValue";
}

export function isModify(mark: Offset | R.Mark): mark is R.Modify {
	const partial = mark as Partial<R.Modify>;
	return isOffset(mark) === false
		&& (partial.type === "Modify" || partial.type === undefined)
		&& (partial.modify !== undefined || partial.value !== undefined);
}

export function isInsert(mark: Offset | R.Mark): mark is R.Insert {
	return typeof mark === "object" && mark.type === "Insert";
}

export function isPrior(mark: Offset | R.Mark): mark is R.Prior {
	return typeof mark === "object" && mark.type?.startsWith("Prior") === true;
}

export function isPriorDetach(mark: Offset | R.Mark): mark is R.PriorDetach {
	return typeof mark === "object" && mark.type === "PriorDetach";
}

export function isDelete(mark: Offset | R.Mark): mark is R.Delete {
	return typeof mark === "object" && mark.type === "Delete";
}

export function isMoveIn(mark: Offset | R.Mark): mark is R.MoveIn {
	return typeof mark === "object" && (mark.type === "MoveInSlice" || mark.type === "MoveInSet");
}

export function isMoveOut(mark: Offset | R.Mark): mark is R.MoveOut {
	return typeof mark === "object" && mark.type === "MoveOut";
}

export function isMoveOutStart(mark: R.Mark): mark is R.MoveOutStart {
	return (mark as Partial<R.MoveOutStart>).type === "MoveOutStart";
}
export function isDeleteStart(mark: R.Mark): mark is R.DeleteStart {
	return (mark as Partial<R.DeleteStart>).type === "DeleteStart";
}
export function isEnd(mark: Offset | R.Mark): mark is R.SliceEnd {
	return typeof mark === "object" && mark.type === "End";
}

export function isPriorSliceEnd(mark: Offset | R.Mark): mark is R.PriorSliceEnd {
	return typeof mark === "object" && mark.type === "PriorSliceEnd";
}

export function isStartBound(mark: R.TraitMark): mark is R.SliceBound {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "MoveOutStart"
		|| markType === "DeleteStart"
	;
}

export function isBound(mark: R.TraitMark): mark is R.SliceBound {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "MoveOutStart"
		|| markType === "DeleteStart"
		|| markType === "End"
	;
}

export function isPriorBound(mark: R.TraitMark): mark is R.PriorSliceBound {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "PriorDeleteStart"
		|| markType === "PriorMoveOutStart"
		|| markType === "PriorSliceEnd"
	;
}

export function isOffset(mark: unknown): mark is Offset {
	return typeof mark === "number";
}

export function isSegment(mark: R.ObjMark | Offset): mark is R.SegmentMark {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Insert"
		|| markType === "Delete"
		|| markType === "MoveInSet"
		|| markType === "MoveInSlice"
		|| markType === "MoveOut"
	;
}

export function isAttachSegment(mark: R.ObjMark | Offset): mark is R.AttachMark {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Insert"
		|| markType === "MoveInSet"
		|| markType === "MoveInSlice"
	;
}

export function isDetachSegment(mark: R.ObjMark | Offset):
	mark is R.Delete | R.MoveOut {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Delete"
		|| markType === "MoveOut"
		|| markType === "PriorDetach"
	;
}

export function isReturn(mark: R.ObjMark | Offset): mark is R.ReturnSet | R.ReturnSlice {
	return typeof mark === "object" && (mark.type === "ReturnSet" || mark.type === "ReturnSlice");
}

export function isRevive(mark: R.ObjMark | Offset): mark is R.ReviveSet | R.ReviveSlice {
	return typeof mark === "object" && (mark.type === "ReviveSet" || mark.type === "ReviveSlice");
}

export function isReviveSet(mark: R.ObjMark | Offset): mark is R.ReviveSet {
	return typeof mark === "object" && mark.type === "ReviveSet";
}

export function isReviveSlice(mark: R.ObjMark | Offset): mark is R.ReviveSlice {
	return typeof mark === "object" && mark.type === "ReviveSlice";
}

export function isRevert(mark: R.ObjMark | Offset): mark is R.RevertValue {
	return typeof mark === "object" && mark.type === "RevertValue";
}

export function isConstraintFrame(frame: O.TransactionFrame | R.TransactionFrame): frame is R.ConstraintFrame {
	return Array.isArray(frame);
}

export function isChangeFrame(frame: O.TransactionFrame | R.TransactionFrame): frame is R.ChangeFrame {
	return !isConstraintFrame(frame);
}

export function lengthFromMark(mark: Offset | R.Mark | undefined): number {
	if (mark === undefined || isBound(mark) || isPriorBound(mark)) {
		return 0;
	}
	if (isOffset(mark)) {
		return mark;
	}
	if (isModify(mark) || isSetValue(mark) || isRevert(mark)) {
		return 1;
	}
	if (isInsert(mark)) {
		return mark.content.length;
	}
	return mark.length ?? 1;
}

export class Pointer {
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

	private constructor(
		marks: R.TraitMarks,
		iMark: number,
		iNode: number,
		inSlice: number,
	) {
		this.marks = marks;
		this.iMark = iMark;
		this.iNode = iNode;
		this.inSlice = inSlice;
	}

	public static fromMarks(
		marks: R.TraitMarks,
	): Pointer {
		return new Pointer(
			marks,
			0,
			0,
			0,
		);
	}

	public get mark(): R.TraitMark | undefined {
		return this.marks[this.iMark];
	}

	public deleteMarks(markCount: number): Pointer {
		assert(this.iNode === 0, "Only a whole mark can be delete");
		this.marks.splice(this.iMark, markCount);
		return this;
	}

	public replaceMark(newMark: R.TraitMark): Pointer {
		assert(this.iNode === 0, "Only a whole mark can be replaced");
		this.marks.splice(this.iMark, 1, newMark);
		return this.skipMarks(1);
	}

	public insert(newMark: R.TraitMark): Pointer {
		const ptr = this.ensureMarkStart();
		this.marks.splice(ptr.iMark, 0, newMark);
		return ptr.skipMarks(1);
	}

	public findSliceEnd(startMark: R.SliceBound | R.PriorSliceBound): Pointer {
		let index;
		if (isPrior(startMark)) {
			index = findIndexFrom(
				this.marks,
				this.iMark,
				(m) => isPriorSliceEnd(m) && m.op === startMark.op && m.seq === startMark.seq,
			);
		} else {
			index = findIndexFrom(
				this.marks,
				this.iMark,
				(m) => isEnd(m) && m.op === startMark.op,
			);
		}
		return new Pointer(
			this.marks,
			index ?? fail("No matching end mark"),
			0,
			0,
		);
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

	public skipMarks(markCount: number): Pointer {
		const { marks, iMark, inSlice } = this;
		return new Pointer(marks, iMark + markCount, 0, inSlice).seek(0);
	}

	public seek(nodeOffset: number): Pointer {
		assert(nodeOffset >= 0, "The offset must be >= to zero");
		let offset = nodeOffset;
		let { iMark, iNode } = this;
		const { marks, inSlice } = this;
		const markMax = marks.length;
		while (offset > 0 && iMark < markMax) {
			const mark = marks[iMark];
			const nodeCount = lengthFromMark(mark);
			if (iNode + offset >= nodeCount) {
				iMark += 1;
				offset -= nodeCount - iNode;
				iNode = 0;
				// if (isBound(mark)) {
				// 	if (isEnd(mark)) {
				// 		assert(inSlice > 0, "Unbalanced slice bounds");
				// 		inSlice -= 1;
				// 	} else {
				// 		inSlice += 1;
				// 	}
				// }
			} else {
				break;
			}
		}
		return new Pointer(
			marks,
			iMark,
			iNode + offset,
			inSlice,
		);
	}
}

export function splitMark(mark: Readonly<Offset | R.Mark>, offset: number): [Offset | R.Mark, Offset | R.Mark] {
	if (offset === 0) {
		fail("Cannot split a mark with an offset of 0");
	}
	if (isOffset(mark)) {
		return [offset, mark - offset];
	}
	if (isMoveIn(mark)) {
		fail("Cannot split a MoveIn mark");
	}
	const mLength = lengthFromMark(mark);
	if (mLength === offset) {
		return [{ ...mark }, 0];
	}
	if (isSegment(mark) || isPriorDetach(mark) || isRevive(mark)) {
		if (isInsert(mark)) {
			return [
				{ ...mark, content: mark.content.slice(0, offset) },
				{ ...mark, content: mark.content.slice(offset) },
			];
		}
		const mods = mark.mods !== undefined ? [mark.mods.slice(0, offset), mark.mods.slice(offset)] : [];
		return [
			{ ...mark, length: offset, mods: mods[0] },
			{ ...mark, length: mLength - offset, mods: mods[1] },
		];
	} else {
		fail("TODO: support other mark types");
	}
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
