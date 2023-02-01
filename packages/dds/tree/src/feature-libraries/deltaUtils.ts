/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { Delta, FieldKey, isSkipMark } from "../core";
import { Mutable } from "../util";

/**
 * Converts a `Delta.FieldMarks` whose tree content is represented with by `TIn` instances
 * into a `Delta.FieldMarks` whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param fields - The Map of fields to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapFieldMarks<TIn, TOut>(
	fields: Delta.FieldChangeMap<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldChangeMap<TOut> {
	const out: Map<FieldKey, Delta.FieldChanges<TOut>> = new Map();
	for (const [k, v] of fields) {
		out.set(k, mapFieldChanges<TIn, TOut>(v, func));
	}
	return out;
}

/**
 * Converts a `Delta.FieldChanges` whose tree content is represented with by `TIn` instances
 * into a `Delta.FieldChanges` whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param changes - The FieldChanges to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapFieldChanges<TIn, TOut>(
	changes: Delta.FieldChanges<TIn>,
	func: (tree: TIn) => TOut,
): Delta.FieldChanges<TOut> {
	const field: Mutable<Delta.FieldChanges<TOut>> = {};
	if (changes.beforeShallow) {
		field.beforeShallow = changes.beforeShallow.map((nested) => mapNodeChanges(nested, func));
	}
	if (changes.shallow) {
		field.shallow = mapMarkList(changes.shallow, func);
	}
	if (changes.afterShallow) {
		field.afterShallow = changes.afterShallow.map((nested) => mapNodeChanges(nested, func));
	}
	return field;
}

/**
 * Converts a `Delta.NodeChanges` whose tree content is represented with by `TIn` instances
 * into a `Delta.NodeChanges` whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param changes - The node changes to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapNodeChanges<TIn, TOut>(
	changes: Delta.NestedChange<TIn>,
	func: (tree: TIn) => TOut,
): Delta.NestedChange<TOut> {
	const out: Mutable<Delta.NestedChange<TOut>> = { index: changes.index };
	if (changes.fields !== undefined) {
		out.fields = mapFieldMarks(changes.fields, func);
	}
	if (changes.setValue !== undefined) {
		out.setValue = changes.setValue;
	}
	return out;
}

/**
 * Converts a `Delta.MarkList` whose tree content is represented with by `TIn` instances
 * into a `Delta.MarkList` whose tree content is represented with by `TOut` instances.
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
 * into a `Delta.Mark` whose tree content is represented with by `TOut` instances.
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
	if (isSkipMark(mark)) {
		return mark;
	}
	const type = mark.type;
	switch (type) {
		case Delta.MarkType.Insert: {
			return {
				type: Delta.MarkType.Insert,
				content: mark.content.map(func),
			};
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
