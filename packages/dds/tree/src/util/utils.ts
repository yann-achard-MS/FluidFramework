/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

export type OffsetListOffsetType<TList> = TList extends OffsetList<infer TContent, infer TOffset> ? TOffset : never;
export type OffsetListContentType<TList> = TList extends OffsetList<infer TContent, infer TOffset> ? TContent : never;

export class OffsetListPtr {
	private readonly list: OffsetList;
	private readonly listIdx: number;
	private readonly realIdx: number;
	private readonly realOffset: number;

	private constructor(
		list: OffsetList,
		listIdx: number,
		realIdx: number,
		realOffset: number,
	) {
		this.list = list;
		this.listIdx = listIdx;
		this.realIdx = realIdx;
		this.realOffset = realOffset;
	}

	public static fromList(list: OffsetList): OffsetListPtr {
		return new OffsetListPtr(list, 0, 0, 0);
	}

	public fwd(offset: number): OffsetListPtr {
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
			} else {
				toSkip -= 1;
				listIdx += 1;
			}
		}
		return new OffsetListPtr(this.list, listIdx, this.realIdx + offset, realOffset);
	}

	public addOffset(offset: number): OffsetListPtr {
		const elem = this.list[this.listIdx];
		if (elem === undefined) {
			// No need to add an offset since there is nothing to the right
		} else if (typeof elem === "number") {
			this.list[this.listIdx] = elem + offset;
		} else {
			this.list.splice(this.listIdx, 0, offset);
		}
		return this.fwd(offset);
	}
}
