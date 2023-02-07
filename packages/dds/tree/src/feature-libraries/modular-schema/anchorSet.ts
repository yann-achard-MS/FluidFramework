/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaggedChange } from "../../core";

export type MergeCallback<TData> = (existingData: TData, newData: TData) => TData;
export type UpdateCallback<TData> = (data: TData) => TData;

export interface FieldAnchorSet<TKey, TChangeset, TData = undefined> {
	clone(): FieldAnchorSet<TKey, TChangeset, TData>;
	update(func: UpdateCallback<TData>): void;
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
