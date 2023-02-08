/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaggedChange } from "../../core";

export type MergeCallback<TData> = (existingData: TData, newData: TData) => TData;
export type UpdateCallback<TData, TKey> = (data: TData, key: TKey) => TData;
export type MapCallback<TIn, TOut> = (data: TIn) => TOut;

export interface FieldAnchorSet<TKey, TChangeset, TData = undefined> {
	clone(): FieldAnchorSet<TKey, TChangeset, TData>;
	// update(key: TKey, func: UpdateCallback<TData, TKey>): void;
	map<TOut>(func: MapCallback<TData, TOut>): FieldAnchorSet<TKey, TChangeset, TOut>;
	updateAll(func: UpdateCallback<TData, TKey>): void;
	mergeIn(set: FieldAnchorSet<TKey, TChangeset, TData>, mergeData?: MergeCallback<TData>): void;
	track(key: TKey, data: TData, mergeData?: MergeCallback<TData>): void;
	forget(key: TKey): void;
	lookup(key: TKey): FieldAnchorSetEntry<TData, TKey> | undefined;
	rebase(over: TaggedChange<TChangeset>, direction: RebaseDirection): void;
	entries(): IterableIterator<FieldAnchorSetEntry<TData, TKey>>;
}

export interface FieldAnchorSetEntry<TData, TKey> {
	readonly key: TKey;
	readonly data: TData;
}

export enum RebaseDirection {
	Forward,
	Backward,
}
