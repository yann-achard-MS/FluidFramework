/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import structuredClone from "@ungap/structured-clone";
import {
	GapCount,
	Effects,
	NodeCount,
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

export type OneOrMany<T> = T | T[];

export function isInsert(mark: Readonly<GapCount | R.Attach>): mark is R.Insert {
	return typeof mark === "object" && mark.type === "Insert";
}

export function isMoveIn(mark: Readonly<GapCount | R.Attach>): mark is R.MoveIn {
	return typeof mark === "object" && mark.type === "Move";
}

export function isNewDetach(mark: Readonly<NodeCount | R.Detach | R.Reattach>): mark is R.Detach {
	return typeof mark === "object"
	&& (mark.type === "Delete" || mark.type === "Move");
}

export function isReattach(mark: Readonly<NodeCount | R.Detach | R.Reattach>): mark is R.Reattach {
	return typeof mark === "object"
	&& (mark.type === "Revive" || mark.type === "Return");
}

export function lengthFromOffsets(marks: Readonly<NodeCount | GapCount | any>[] | undefined): number {
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

/**
 * Used as a default branch in switch statements to enforce that all possible branches are accounted for.
 *
 * Example:
 * ```typescript
 * const bool: true | false = ...;
 * switch(bool) {
 *   case true: {...}
 *   case false: {...}
 *   default: neverCase(bool);
 * }
 * ```
 *
 * @param never The switch value
 */
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
