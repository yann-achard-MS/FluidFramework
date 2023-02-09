/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaggedChange } from "../../core";

export type MergeCallback<TData> = (existingData: TData, newData: TData) => TData;
export type UpdateCallback<TData, TKey> = (data: TData, key: TKey) => TData;
export type MapCallback<TIn, TOut> = (data: TIn) => TOut;

export interface FieldAnchorSet<TKey, TChangeset, TData = undefined> {
	count(): number;
	clone(): FieldAnchorSet<TKey, TChangeset, TData>;
	map<TOut>(func: MapCallback<TData, TOut>): FieldAnchorSet<TKey, TChangeset, TOut>;
	updateAll(func: UpdateCallback<TData, TKey>): void;
	mergeIn(set: FieldAnchorSet<TKey, TChangeset, TData>, mergeData?: MergeCallback<TData>): void;
	track(key: TKey, data: TData, mergeData?: MergeCallback<TData>): void;
	forget(key: TKey): void;
	lookup(key: TKey): FieldAnchorSetEntry<TData, TKey> | undefined;
	rebase(over: TaggedChange<TChangeset>, direction: RebaseDirection): void;
	entries(): IterableIterator<FieldAnchorSetEntry<TData, TKey>>;
}

// export class SetOf<T = unknown> {
// 	private constructor() {}
// 	protected readonly _T?: T;
// }

// export type AsSetOf<ValueType, T = unknown> = ValueType & SetOf<T>;

// export interface FieldAnchorFuncs<TKey, TChangeset> {
// 	readonly factory: <TData>() => SetOf<TData>;
// 	readonly clone: <TData>(set: SetOf<TData>) => SetOf<TData>;
// 	readonly map: <TIn, TOut>(set: SetOf<TIn>, func: MapCallback<TIn, TOut>) => SetOf<TOut>;
// 	readonly track: <TData>(
// 		set: SetOf<TData>,
// 		key: TKey,
// 		data: TData,
// 		mergeData?: MergeCallback<TData>,
// 	) => void;
// 	readonly forget: (set: SetOf, key: TKey) => void;
// 	readonly lookup: <TData>(
// 		set: SetOf<TData>,
// 		key: TKey,
// 	) => FieldAnchorSetEntry<TData, TKey> | undefined;
// 	readonly rebase: (
// 		set: SetOf,
// 		over: TaggedChange<TChangeset>,
// 		direction: RebaseDirection,
// 	) => void;
// }

export interface FieldAnchorSetEntry<TData, TKey> {
	readonly key: TKey;
	readonly data: TData;
}

export enum RebaseDirection {
	Forward,
	Backward,
}
