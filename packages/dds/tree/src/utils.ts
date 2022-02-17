/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Offset,
	Rebased as R,
} from "./format";

export type OneOrMany<T> = T | T[];

export type VisitOutput = boolean | undefined | void;

export interface RebasedFrameVisitor {
	readonly onChange?: (frame: R.ChangeFrame) => VisitOutput;
	readonly onConstraint?: (frame: R.ConstraintFrame) => VisitOutput;

	readonly onMark?: (mark: R.Mark) => VisitOutput;
	readonly onObjMark?: (mark: R.ObjMark) => VisitOutput;
	readonly onNode?: (node: R.ProtoNode) => VisitOutput;

	readonly onSegment?: (mark: R.SegmentMark) => VisitOutput;
	readonly onMod?: (mark: R.ModsMark) => VisitOutput;
	readonly onAttach?: (mark: R.AttachMark) => VisitOutput;
	readonly onDetach?: (mark: R.DetachMark) => VisitOutput;
	readonly onBound?: (mark: R.SliceBound) => VisitOutput;
	readonly onStartBound?: (mark: R.SliceStart) => VisitOutput;

	readonly onModify?: (mark: R.Modify) => VisitOutput;
	readonly onSetValue?: (mark: R.SetValue) => void;
	readonly onInsert?: (mark: R.Insert) => VisitOutput;
	readonly onDelete?: (mark: R.Delete) => VisitOutput;
	readonly onMoveIn?: (mark: R.MoveIn) => VisitOutput;
	readonly onMoveOut?: (mark: R.MoveOut) => VisitOutput;
	readonly onMoveOutStart?: (mark: R.MoveOutStart) => void;
	readonly onDeleteStart?: (mark: R.DeleteStart) => void;
	readonly onSliceEnd?: (mark: R.SliceEnd) => void;
	readonly onOffset?: (mark: Offset) => void;
}

export function visitFrame(
	frame: R.ChangeFrame | R.ConstraintFrame,
	visitor: RebasedFrameVisitor,
): void {
	if (isChangeFrame(frame)) {
		const skip = visitor.onChange?.(frame);
		if (skip !== false) {
			visitChangeFrame(frame, visitor);
		}
	} else if (isConstraintFrame(frame)) {
		visitor.onConstraint?.(frame);
	} else {
		throw(new Error("Transaction frame is neither a constraint nor a change"));
	}
}

export function visitChangeFrame(changeFrame: R.ChangeFrame, visitor: RebasedFrameVisitor): void {
	visitMarks(changeFrame.marks, visitor);
}

export function visitMarks(marks: (Offset | R.ObjMark)[], visitor: RebasedFrameVisitor): void {
	for (const mark of marks) {
		visitMark(mark, visitor);
	}
}

export function visitMods(
	marks: (Offset | R.ModsMark)[],
	visitor: RebasedFrameVisitor,
): void {
	for (const mark of marks) {
		visitMark(mark, visitor);
	}
}

export function visitMark(
	mark: Offset | R.Mark,
	visitor: RebasedFrameVisitor,
): void {
	if (typeof mark === "number") {
		visitor.onOffset?.(mark);
	} else if (typeof mark === "object") {
		const skipMark = visitor.onMark?.(mark);
		if (skipMark !== false) {
			if (Array.isArray(mark)) {
				// TODO: racing
			} else {
				const skipObjMark = visitor.onObjMark?.(mark);
				if (skipObjMark !== false) {
					if (isModify(mark)) {
						const skipMod = visitor.onMod?.(mark);
						if (skipMod !== false) {
							const skipModify = visitor.onModify?.(mark);
							if (skipModify !== false) {
								if (mark.modify !== undefined) {
									for (const modifyOrMarks of Object.values(mark.modify)) {
										visitMarks(modifyOrMarks, visitor);
									}
								}
							}
						}
					} else if (isSetValue(mark)) {
						const skipMod = visitor.onMod?.(mark);
						if (skipMod !== false) {
							visitor.onSetValue?.(mark);
						}
					} else if (isBound(mark)) {
						const skipBound = visitor.onBound?.(mark);
						if (skipBound !== false) {
							if (isEnd(mark)) {
								visitor.onSliceEnd?.(mark);
							} else {
								const skipStart = visitor.onStartBound?.(mark);
								if (skipStart !== false) {
									if (isMoveOutStart(mark)) {
										visitor.onMoveOutStart?.(mark);
									} else {
										visitor.onDeleteStart?.(mark);
									}
								}
							}
						}
					} else if (isSegment(mark)) {
						const skipSegment = visitor.onSegment?.(mark);
						if (skipSegment !== false) {
							if (isDetachSegment(mark)) {
								const skipDetach = visitor.onDetach?.(mark);
								if (skipDetach !== false) {
									if (mark.type === "Delete") {
										const skipDelete = visitor.onDelete?.(mark);
										if (skipDelete !== false && mark.mods !== undefined) {
											visitMods(mark.mods, visitor);
										}
									} else {
										const skipMoveOut = visitor.onMoveOut?.(mark);
										if (skipMoveOut !== false && mark.mods !== undefined) {
											visitMods(mark.mods, visitor);
										}
									}
								}
							} else {
								const skipAttach = visitor.onAttach?.(mark);
								if (skipAttach !== false) {
									if (mark.type === "Insert") {
										const skipInsert = visitor.onInsert?.(mark);
										if (skipInsert !== false && mark.mods !== undefined) {
											visitMods(mark.mods, visitor);
										}
									} else {
										const skipMoveIn = visitor.onMoveIn?.(mark);
										if (skipMoveIn !== false) {
											visitMarks(mark.contents, visitor);
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}
}

export function isSetValue(mark: R.ObjMark): mark is R.SetValue {
	return mark.type === "SetValue";
}
export function isModify(mark: R.Mark): mark is R.Modify {
	const partial = mark as Partial<R.Modify>;
	return (partial.type === "Modify" || partial.type === undefined)
		&& (partial.modify !== undefined || partial.setValue !== undefined);
}
// export function isInsert(mark: R.Mark): mark is R.Insert { return mark.type === "Insert"; }
// export function isDelete(mark: R.Mark): mark is R.Delete { return mark.type === "Delete"; }
// export function isMoveIn(mark: R.Mark): mark is R.MoveIn { return mark.type === "MoveIn"; }
export function isMoveOutStart(mark: R.Mark): mark is R.MoveOutStart {
	return (mark as Partial<R.MoveOutStart>).type === "MoveOutStart";
}
export function isDeleteStart(mark: R.Mark): mark is R.DeleteStart {
	return (mark as Partial<R.DeleteStart>).type === "DeleteStart";
}
export function isEnd(mark: R.Mark): mark is R.SliceEnd {
	return (mark as Partial<R.SliceEnd>).type === "End";
}
export function isBound(mark: R.ObjMark): mark is R.SliceBound | R.SliceBound {
	const markType = mark.type;
	return markType === "MoveOutStart"
		|| markType === "DeleteStart"
		|| markType === "End"
	;
}
export function isOffset(mark: R.Mark | Offset | undefined): mark is Offset {
	return typeof mark === "number";
}
export function isSegment(mark: R.ObjMark | Offset):
	mark is R.Insert | R.Delete | R.MoveIn | R.MoveOut {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Insert"
		|| markType === "Delete"
		|| markType === "MoveIn"
		|| markType === "MoveOut"
	;
}

export function isAttachSegment(mark: R.ObjMark | Offset):
	mark is R.Insert | R.MoveIn {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Insert"
		|| markType === "MoveIn"
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
	;
}

export function isConstraintFrame(frame: R.ChangeFrame | R.ConstraintFrame): frame is R.ConstraintFrame {
	return Array.isArray(frame);
}

export function isChangeFrame(frame: R.ChangeFrame | R.ConstraintFrame): frame is R.ChangeFrame {
	return !isConstraintFrame(frame);
}

// export namespace ChangeNav {
// 	export function fromChange(change: R.ChangeFrame): RootNav {
// 		return new RootNav(change);
// 	}

// 	export class RootNav {
// 		private readonly change: R.ChangeFrame;

// 		public constructor(change: R.ChangeFrame) {
// 			this.change = change;
// 		}

// 		public get isRemoved(): boolean {
// 			if (isModify(this.change)) {
// 				return false;
// 			}

// 		}
// 		public trait(label: string): TraitNav {

// 			return new TraitNav();
// 		}
// 	}

// 	export class TraitNav {
// 		private readonly marks: R.TraitMarks;

// 		public constructor(marks: R.TraitMarks) {
// 			this.marks = marks;
// 		}

// 		public flatten(): (Offset | R.ObjMark | R.PriorTypes)[] {

// 		}
// 	}
// }
