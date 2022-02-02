/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AttachMark,
	ChangeFrame,
	ConstraintFrame,
	DeleteStartType,
	DeleteType,
	DetachMark,
	InsertType,
	Mark,
	Modify,
	ModifyType,
	ModsMark,
	MoveInType,
	MoveOutStartType,
	MoveOutType,
	ObjMark,
	Offset,
	PeerSliceBound,
	ProtoNodeType,
	SegmentMark,
	SetValueMarkType,
	SetValueType,
	SliceBound,
	SliceBoundType,
	SliceEndType,
	SliceStartType,
	TypeSet,
} from "./Format";

export type OneOrMany<T> = T | T[];

export type VisitOutput = boolean | undefined | void;

export interface Visitor<T extends TypeSet> {
	readonly onChange?: (frame: ChangeFrame<T>) => VisitOutput;
	readonly onConstraint?: (frame: ConstraintFrame) => VisitOutput;

	readonly onMark?: (mark: Mark<T>) => VisitOutput;
	readonly onObjMark?: (mark: ObjMark<T>) => VisitOutput;
	readonly onNode?: (node: ProtoNodeType<T>) => VisitOutput;

	readonly onSegment?: (mark: SegmentMark<T>) => VisitOutput;
	readonly onMod?: (mark: ModsMark<T>) => VisitOutput;
	readonly onAttach?: (mark: AttachMark<T>) => VisitOutput;
	readonly onDetach?: (mark: DetachMark<T>) => VisitOutput;
	readonly onBound?: (mark: SliceBoundType<T>) => VisitOutput;
	readonly onStartBound?: (mark: SliceStartType<T>) => VisitOutput;

	readonly onModify?: (mark: ModifyType<T>) => VisitOutput;
	readonly onSetValue?: (mark: SetValueType<T>) => void;
	readonly onSetValueMark?: (mark: SetValueMarkType<T>) => void;
	readonly onInsert?: (mark: InsertType<T>) => VisitOutput;
	readonly onDelete?: (mark: DeleteType<T>) => VisitOutput;
	readonly onMoveIn?: (mark: MoveInType<T>) => VisitOutput;
	readonly onMoveOut?: (mark: MoveOutType<T>) => VisitOutput;
	readonly onMoveOutStart?: (mark: MoveOutStartType<T>) => void;
	readonly onDeleteStart?: (mark: DeleteStartType<T>) => void;
	readonly onSliceEnd?: (mark: SliceEndType<T>) => void;
	readonly onOffset?: (mark: Offset) => void;
}

export function visitFrame<T extends TypeSet>(frame: ChangeFrame<T> | ConstraintFrame, visitor: Visitor<T>): void {
	if (isChangeFrame(frame)) {
		const skip = visitor.onChange?.(frame);
		if (skip !== false) {
			visitMarks(frame, visitor);
		}
	} else if (isConstraintFrame(frame)) {
		visitor.onConstraint?.(frame);
	} else {
		throw(new Error("Transaction frame is neither a constraint nor a change"));
	}
}

export function visitMarks<T extends TypeSet>(marks: ChangeFrame<T>, visitor: Visitor<T>): void {
	if (Array.isArray(marks)) {
		for (const mark of marks) {
			visitMark(mark, visitor);
		}
	} else {
		visitMark(marks, visitor);
	}
}

export function visitMods<T extends TypeSet>(
	marks: ModifyType<T> | SetValueMarkType<T> | (Offset | ModifyType<T> | SetValueMarkType<T>)[],
	visitor: Visitor<T>,
): void {
	if (Array.isArray(marks)) {
		for (const mark of marks) {
			visitMark(mark, visitor);
		}
	} else {
		visitMark(marks, visitor);
	}
}

export function visitMark<T extends TypeSet>(mark: Offset | Mark<T>, visitor: Visitor<T>): void {
	if (typeof mark === "number") {
		visitor.onOffset?.(mark);
	} else if (typeof mark === "object") {
		const skipMark = visitor.onMark?.(mark);
		if (skipMark !== false) {
			if (Array.isArray(mark)) {
				for (const lane of mark) {
					visitMarks(lane, visitor);
				}
			} else {
				const skipObjMark = visitor.onObjMark?.(mark);
				if (skipObjMark !== false) {
					if (isModify(mark)) {
						const skipMod = visitor.onMod?.(mark);
						if (skipMod !== false) {
							const skipModify = visitor.onModify?.(mark);
							if (skipModify !== false) {
								if (mark.setValue !== undefined) {
									visitor.onSetValue?.(mark.setValue);
								}
								if (mark.modify !== undefined) {
									for (const modifyOrMarks of Object.values(mark.modify)) {
										if (Array.isArray(modifyOrMarks)) {
											visitMarks(modifyOrMarks, visitor);
										} else {
											visitMark(modifyOrMarks, visitor);
										}
									}
								}
							}
						}
					} else if (isSetValueMark(mark)) {
						const skipMod = visitor.onMod?.(mark);
						if (skipMod !== false) {
							visitor.onSetValueMark?.(mark);
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
										if (skipMoveIn !== false && mark.mods !== undefined) {
											visitMods(mark.mods, visitor);
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

export function isSetValueMark<T extends TypeSet>(mark: ObjMark<T>): mark is SetValueMarkType<T> {
	return mark.type === "SetValue";
}
export function isModify<T extends TypeSet>(mark: Mark<T>): mark is ModifyType<T> {
	const partial = mark as Partial<Modify<T>>;
	return partial.modify !== undefined || partial.setValue !== undefined;
}
// export function isInsert<T extends TypeSet>(mark: Mark<T>): mark is InsertType<T> { return mark.type === "Insert"; }
// export function isDelete<T extends TypeSet>(mark: Mark<T>): mark is DeleteType<T> { return mark.type === "Delete"; }
// export function isMoveIn<T extends TypeSet>(mark: Mark<T>): mark is MoveInType<T> { return mark.type === "MoveIn"; }
export function isMoveOutStart<T extends TypeSet>(mark: Mark<T>): mark is MoveOutStartType<T> {
	return (mark as Partial<MoveOutStartType<T>>).type === "MoveOutStart";
}
export function isDeleteStart<T extends TypeSet>(mark: Mark<T>): mark is DeleteStartType<T> {
	return (mark as Partial<DeleteStartType<T>>).type === "DeleteStart";
}
export function isEnd<T extends TypeSet>(mark: Mark<T>): mark is SliceEndType<T> {
	return (mark as Partial<SliceEndType<T>>).type === "End";
}
export function isBound<T extends TypeSet>(mark: ObjMark<T>): mark is SliceBound | PeerSliceBound {
	const markType = mark.type;
	return markType === "MoveOutStart"
		|| markType === "DeleteStart"
		|| markType === "End"
	;
}
export function isOffset<T extends TypeSet>(mark: Mark<T> | Offset | undefined): mark is Offset {
	return typeof mark === "number";
}
export function isSegment<T extends TypeSet>(mark: ObjMark<T> | Offset):
	mark is InsertType<T> | DeleteType<T> | MoveInType<T> | MoveOutType<T> {
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

export function isAttachSegment<T extends TypeSet>(mark: ObjMark<T> | Offset):
	mark is InsertType<T> | MoveInType<T> {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Insert"
		|| markType === "MoveIn"
	;
}

export function isDetachSegment<T extends TypeSet>(mark: ObjMark<T> | Offset):
	mark is DeleteType<T> | MoveOutType<T> {
	if (typeof mark === "number") {
		return false;
	}
	const markType = mark.type;
	return markType === "Delete"
		|| markType === "MoveOut"
	;
}

export function isConstraintFrame(frame: ChangeFrame | ConstraintFrame): frame is ConstraintFrame {
	const innerObj = Array.isArray(frame) ? frame[0] : frame;
	if (typeof innerObj !== "object" || Array.isArray(innerObj)) {
		// Empty change frame
		return false;
	}
	return innerObj.type === "ConstrainedRange" || innerObj.type === "ConstrainedTraitSet";
}

export function isChangeFrame(frame: ChangeFrame | ConstraintFrame): frame is ChangeFrame {
	if (isConstraintFrame(frame)) {
		return false;
	}
	const innerObj = Array.isArray(frame) ? frame[0] : frame;
	if (innerObj === undefined) {
		// Empty change frame
		return true;
	}
	if (typeof innerObj === "number") {
		// The innerObj is an Offset mark
		return true;
	}
	if (Array.isArray(innerObj)) {
		// The innerObj is a race mark
		return true;
	}
	if (isModify(innerObj)) {
		return true;
	}
	const innerType = innerObj.type;
	return innerType === "Insert"
		|| innerType === "Delete"
		|| innerType === "MoveIn"
		|| innerType === "MoveOut"
		|| innerType === "MoveOutStart"
		|| innerType === "DeleteStart"
		|| innerType === "SetValue"
	;
}
