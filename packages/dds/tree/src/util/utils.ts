/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import structuredClone from "@ungap/structured-clone";
import { OffsetList } from "../changeset";

export function clone<T>(original: T): T {
    return structuredClone(original);
}

export function fail(message: string): never {
    throw new Error(message);
}

export function mapObject<T, U>(obj: T, f: (v: T[keyof T], k: keyof T) => U): ({ [K in keyof T]: U }) {
	const out: { [K in keyof T]?: U } = {};
	for (const [k, v] of Object.entries(obj)) {
		out[k as keyof T] = f(v, k as keyof T);
	}
	return out as { [K in keyof T]: U };
}

export function mapGetOrSet<K, V>(map: Map<K, V>, key: K, defaultFactory: () => V): V {
	const maybe = map.get(key);
	if (maybe === undefined) {
		const empty = defaultFactory();
		map.set(key, empty);
		return empty;
	}
	return maybe;
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
 * @param never - The switch value
 */
export function neverCase(never: never): never {
	fail("neverCase was called");
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Merged {}

export class Conflicted extends Merged {
	constructor(o: unknown) {
		super();
		Object.assign(this, o);
	}
}

export class Conflict extends Merged {
	constructor(public readonly lhs: unknown, public readonly rhs: unknown) {
		super();
	}
}

export function merge<T>(lhs: T, rhs: T): Conflicted | Conflict | T {
	if (lhs instanceof Merged || rhs instanceof Merged) {
		fail("This function does not accept its output type as an input type");
	}

	// === is not reflective because of how NaN is handled, so use Object.is instead.
	// This treats -0 and +0 as different.
	// Since -0 is not preserved in serialization round trips,
	// it can be handed in any way that is reflective and commutative, so this is fine.
	if (Object.is(lhs, rhs)) {
		return lhs;
	}

	// Primitives which are equal would have early returned above, so now if the values are not both objects,
	// they are unequal.
	if (typeof lhs !== "object" || typeof rhs !== "object") {
		return new Conflict(lhs, rhs);
	}

	// null is of type object, and needs to be treated as distinct from the empty object.
	// Handling it early also avoids type errors trying to access its keys.
	// Rationale: 'undefined' payloads are reserved for future use (see 'SetValue' interface).
	if (lhs === null || rhs === null) {
		return new Conflict(lhs, rhs);
	}

	// Special case IFluidHandles, comparing them only by their absolutePath
	// Detect them using JavaScript feature detection pattern: they have a `IFluidHandle`
	// field that is set to the parent object.
	{
		const aHandle = lhs as unknown as IFluidHandle;
		const bHandle = rhs as unknown as IFluidHandle;
		if (aHandle.IFluidHandle === aHandle) {
			if (bHandle.IFluidHandle !== bHandle) {
				return new Conflict(lhs, rhs);
			}
			return aHandle.absolutePath === bHandle.absolutePath ? lhs : new Conflict(lhs, rhs);
		}
	}

	if (Array.isArray(lhs) !== Array.isArray(rhs)) {
		return new Conflict(lhs, rhs);
	}
	if (Array.isArray(lhs) && Array.isArray(rhs)) {
		let same = true;
		const out = [];
		for (let i = 0; i < lhs.length; i += 1) {
			const d = merge(lhs[i], rhs[i]);
			same = same && d instanceof Merged === false;
			out.push(d);
		}
		for (let i = lhs.length; i < rhs.length; i += 1) {
			const d = merge(lhs[i], rhs[i]);
			same = same && d instanceof Merged === false;
			out.push(d);
		}
		return same ? out : new Conflicted(out);
	}

	{
		// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
		const lhsKeys = Object.keys(lhs);
		const rhsKeys = Object.keys(rhs);
		const selfKeys: string[] = [];

		const lhsObj = lhs as Record<string, unknown>;
		const rhsObj = rhs as Record<string, unknown>;
		let same = true;
		const out: Record<string, unknown> = {};
		for (const key of lhsKeys) {
			if (key in rhs === false) {
				same = false;
				out[key] = new Conflict(lhsObj[key], undefined);
			} else {
				// The JavaScript feature detection pattern, used for IFluidHandle, uses a field that is set to the
				// parent object.
				// Detect this pattern and special case it to avoid infinite recursion.
				const aSelf = Object.is(lhsObj[key], lhsObj);
				const bSelf = Object.is(rhsObj[key], rhsObj);
				if (aSelf === true && bSelf === true) {
					selfKeys.push(key);
				}
				const d = merge(lhsObj[key], rhsObj[key]);
				same = same && d instanceof Merged === false;
				out[key] = d;
			}
		}
		for (const key of rhsKeys) {
			if (key in lhs === false) {
				same = false;
				out[key] = new Conflict(undefined, rhsObj[key]);
			}
		}
		const final = same ? out : new Conflicted(out);
		for (const key of selfKeys) {
			out[key] = final;
		}
		return final;
	}
}

export type OffsetListOffsetType<TList> = TList extends OffsetList<infer TContent, infer TOffset> ? TOffset : never;
export type OffsetListContentType<TList> = TList extends OffsetList<infer TContent, infer TOffset> ? TContent : never;

export interface ContentPolicy<TContent> {
	getLength(content: TContent): number;
	split(content: TContent, offset: number): [TContent, TContent];
}

export const unaryContentPolicy = {
	getLength: (): number => 1,
	split: (): never => fail("Length 1 content cannot be split"),
};

export interface HasCount {
	readonly count: number;
}

export const contentWithCountPolicy = {
	getLength: (content: HasCount): number => content.count,
	split: <TContent extends HasCount>(content: TContent, offset: number): [TContent, TContent] =>
	[{ ...content, count: offset }, { ...content, count: content.count - offset }],
};

export class OffsetListPtr<TList extends OffsetList> {
	private readonly list: TList;
	private readonly contentPolicy: ContentPolicy<OffsetListContentType<TList>>;
	private readonly listIdx: number;
	private readonly realIdx: number;
	private readonly realOffset: number;

	private constructor(
		list: TList,
		contentPolicy: ContentPolicy<OffsetListContentType<TList>>,
		listIdx: number,
		realIdx: number,
		realOffset: number,
	) {
		this.list = list;
		this.listIdx = listIdx;
		this.realIdx = realIdx;
		this.realOffset = realOffset;
		this.contentPolicy = contentPolicy;
	}

	public static from<TList extends OffsetList<any, any>>(
		list: TList,
		contentPolicy: ContentPolicy<OffsetListContentType<TList>>,
	): OffsetListPtr<TList> {
		return new OffsetListPtr(list, contentPolicy, 0, 0, 0);
	}

	public fwd(offset: number): OffsetListPtr<TList> {
		let realOffset = this.realOffset;
		let listIdx = this.listIdx;
		let toSkip = offset;
		while (toSkip > 0) {
			const elem = this.list[listIdx];
			if (typeof elem === "number") {
				if (toSkip > elem - realOffset) {
					toSkip -= elem - realOffset;
					listIdx += 1;
					realOffset = 0;
				} else {
					realOffset += toSkip;
					toSkip = 0;
				}
			} else if (elem === undefined) {
				realOffset += toSkip;
				toSkip = 0;
			} else {
				toSkip -= this.contentPolicy.getLength(elem);
				listIdx += 1;
			}
		}
		return new OffsetListPtr(this.list, this.contentPolicy, listIdx, this.realIdx + offset, realOffset);
	}

	public addMark(mark: OffsetListContentType<TList>): OffsetListPtr<TList> {
		const elem = this.list[this.listIdx];
		if (elem === undefined) {
			if (this.realOffset > 0) {
				this.list.push(this.realOffset);
			}
			this.list.push(mark);
		} else if (typeof elem === "number") {
			if (elem === this.realOffset) {
				this.list.push(mark);
			} else if (elem > this.realOffset) {
				this.list.splice(this.listIdx, 1, this.realOffset, mark, elem - this.realOffset);
			} else {
				fail("The ptr offset in the offset element cannot be greater than the length of the element");
			}
		} else {
			const elemLength = this.contentPolicy.getLength(elem);
			if (this.realOffset === 0) {
				this.list.splice(this.listIdx, 0, mark);
			} else if (this.realOffset === elemLength) {
				this.list.splice(this.listIdx + 1, 0, mark);
			} else {
				const [part1, part2] = this.contentPolicy.split(elem, this.realOffset);
				this.list.splice(this.listIdx, 1, part1, mark, part2);
			}
		}
		return this.fwd(this.contentPolicy.getLength(mark));
	}

	public addOffset(offset: number): OffsetListPtr<TList> {
		if (offset === 0) {
			return this;
		}
		const elem = this.list[this.listIdx];
		if (elem === undefined) {
			this.list.push(offset + this.realOffset);
		} else if (typeof elem === "number") {
			this.list[this.listIdx] = elem + offset;
		} else {
			this.list.splice(this.listIdx, 0, offset);
		}
		return this.fwd(offset);
	}

	public splice(deleteCount: number, replacement?: TList): TList {
		// TODO: massage type to remove cast
		const out: TList = [] as unknown as TList;
		
		return out;
	}
}
