/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { Delta, FieldKey } from "../core";
import { Mutable } from "../util";

/**
 * Converts a `Delta.FieldMarks` whose tree content is represented with by `TIn` instances
 * into a `Delta.FieldMarks`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param fields - The Map of fields to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapFieldMarks<TIn, TOut>(
	fields: Delta.FieldMarks<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldMarks<TOut> {
	const out: Map<FieldKey, Delta.MarkList<TOut>> = new Map();
	for (const [k, v] of fields) {
		out.set(k, mapMarkList(v, func));
	}
	return out;
}

/**
 * Converts a `Delta.MarkList` whose tree content is represented with by `TIn` instances
 * into a `Delta.MarkList`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param list - The list of marks to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapMarkList<TIn, TOut>(
	list: Delta.MarkList<TIn>,
	func: (tree: TIn) => TOut,
): Delta.MarkList<TOut> {
	return list.map((mark: Delta.Mark<TIn>) => mapMark(mark, func));
}

/**
 * Converts a `Delta.Mark` whose tree content is represented with by `TIn` instances
 * into a `Delta.Mark`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertMarkListEqual}.
 * @param mark - The mark to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapMark<TIn, TOut>(
	mark: Delta.Mark<TIn>,
	func: (tree: TIn) => TOut,
): Delta.Mark<TOut> {
	if (Delta.isSkipMark(mark)) {
		return mark;
	}
	const type = mark.type;
	switch (type) {
		case Delta.MarkType.Modify: {
			if (mark.fields === undefined && mark.setValue === undefined) {
				return { type: Delta.MarkType.Modify };
			}
			return mark.fields === undefined
				? {
						type: Delta.MarkType.Modify,
						setValue: mark.setValue,
				  }
				: {
						...mark,
						fields: mapFieldMarks(mark.fields, func),
				  };
		}
		case Delta.MarkType.ModifyAndMoveOut: {
			if (mark.fields === undefined && mark.setValue === undefined) {
				return {
					type: Delta.MarkType.ModifyAndMoveOut,
					moveId: mark.moveId,
				};
			}
			return mark.fields === undefined
				? {
						type: Delta.MarkType.ModifyAndMoveOut,
						moveId: mark.moveId,
						setValue: mark.setValue,
				  }
				: {
						...mark,
						fields: mapFieldMarks(mark.fields, func),
				  };
		}
		case Delta.MarkType.MoveInAndModify:
		case Delta.MarkType.ModifyAndDelete: {
			return {
				...mark,
				fields: mapFieldMarks(mark.fields, func),
			};
		}
		case Delta.MarkType.Insert: {
			return {
				type: Delta.MarkType.Insert,
				content: mark.content.map(func),
			};
		}
		case Delta.MarkType.InsertAndModify: {
			const out: Mutable<Delta.InsertAndModify<TOut>> = {
				type: Delta.MarkType.InsertAndModify,
				content: func(mark.content),
			};
			if (mark.fields !== undefined) {
				out.fields = mapFieldMarks(mark.fields, func);
			}
			if (Object.prototype.hasOwnProperty.call(mark, "setValue")) {
				out.setValue = mark.setValue;
			}
			return out;
		}
		case Delta.MarkType.Delete:
		case Delta.MarkType.MoveIn:
		case Delta.MarkType.MoveOut:
			return mark;
		default:
			unreachableCase(type);
	}
}

export interface ChildIndex {
	index: number;
	context: Context;
}

export enum Context {
	Input,
	Output,
}

export function modifyMarkList<TTree>(
	marks: Delta.Mark<TTree>[],
	modify: Delta.Modify<TTree>,
	key: ChildIndex,
): void {
	if ((modify.fields ?? modify.setValue) === undefined) {
		return;
	}
	if (key.context === Context.Input) {
		let iMark = 0;
		let inputIndex = 0;
		while (iMark < marks.length) {
			const mark = marks[iMark];
			if (typeof mark === "number") {
				inputIndex += mark;
			} else {
				const type = mark.type;
				switch (type) {
					case Delta.MarkType.Modify:
					case Delta.MarkType.ModifyAndMoveOut:
					case Delta.MarkType.ModifyAndDelete:
						inputIndex += 1;
						break;
					case Delta.MarkType.Delete:
					case Delta.MarkType.MoveOut:
						inputIndex += mark.count;
						break;
					case Delta.MarkType.Insert:
					case Delta.MarkType.InsertAndModify:
					case Delta.MarkType.MoveInAndModify:
					case Delta.MarkType.MoveIn:
						break;
					default:
						unreachableCase(type);
				}
			}
			if (inputIndex > key.index) {
				const countAfterMod = inputIndex - (key.index + 1);
				const splitMarks: Delta.Mark<TTree>[] = [];
				if (typeof mark === "number") {
					const startOfMark = inputIndex - mark;
					const countBeforeMod = key.index - startOfMark;
					if (countBeforeMod > 0) {
						splitMarks.push(countBeforeMod);
					}
					splitMarks.push(modify);
					if (countAfterMod > 0) {
						splitMarks.push(countAfterMod);
					}
				} else {
					const type = mark.type;
					switch (type) {
						case Delta.MarkType.Modify:
						case Delta.MarkType.ModifyAndMoveOut:
						case Delta.MarkType.ModifyAndDelete:
							// This function was originally created for a use case that does not require this
							// code path.
							assert(false, "Not implemented");
						case Delta.MarkType.Delete:
						case Delta.MarkType.MoveOut: {
							const startOfMark = inputIndex - mark.count;
							const countBeforeMod = key.index - startOfMark;
							if (countBeforeMod > 0) {
								splitMarks.push({
									...mark,
									count: countBeforeMod,
								});
							}
							if (mark.type === Delta.MarkType.Delete) {
								assert(
									modify.fields !== undefined && modify.setValue === undefined,
									"Modifications under a deleted node can only target is descendants",
								);
								splitMarks.push({
									type: Delta.MarkType.ModifyAndDelete,
									fields: modify.fields,
								});
							} else {
								splitMarks.push({
									type: Delta.MarkType.ModifyAndMoveOut,
									fields: modify.fields,
									setValue: modify.setValue,
									moveId: mark.moveId,
								});
							}
							if (countAfterMod > 0) {
								splitMarks.push({
									...mark,
									count: countAfterMod,
								});
							}
							break;
						}
						case Delta.MarkType.Insert:
						case Delta.MarkType.InsertAndModify:
						case Delta.MarkType.MoveInAndModify:
						case Delta.MarkType.MoveIn:
							assert(
								false,
								"Input key that target input context cannot overlap move or insert",
							);
						default:
							unreachableCase(type);
					}
				}
				marks.splice(iMark, 1, ...splitMarks);
			}
			iMark += 1;
		}
	} else {
		let iMark = 0;
		let inputIndex = 0;
		let outputIndex = 0;
		while (iMark < marks.length) {
			const mark = marks[iMark];
			if (typeof mark === "number") {
				inputIndex += mark;
				outputIndex += mark;
			} else {
				const type = mark.type;
				switch (type) {
					case Delta.MarkType.Modify:
						inputIndex += 1;
						outputIndex += 1;
						break;
					case Delta.MarkType.Insert:
						outputIndex += mark.content.length;
						break;
					case Delta.MarkType.InsertAndModify:
					case Delta.MarkType.MoveInAndModify:
						outputIndex += 1;
						break;
					case Delta.MarkType.MoveIn:
						outputIndex += mark.count;
						break;
					case Delta.MarkType.Delete:
					case Delta.MarkType.MoveOut:
						inputIndex += mark.count;
						break;
					case Delta.MarkType.ModifyAndMoveOut:
					case Delta.MarkType.ModifyAndDelete:
						inputIndex += 1;
						break;
					default:
						unreachableCase(type);
				}
			}
			iMark += 1;
		}
	}
}
