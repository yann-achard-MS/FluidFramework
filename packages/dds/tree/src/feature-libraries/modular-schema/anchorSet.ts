/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaggedChange } from "../../core";

export type MergeCallback<TData> = (existingData: TData, newData: TData) => TData;

export interface FieldAnchorSet<TKey, TAnchor, TChangeset, TData = undefined> {
	clone(): FieldAnchorSet<TKey, TAnchor, TChangeset, TData>;
	mergeIn(
		set: FieldAnchorSet<TKey, TAnchor, TChangeset, TData>,
		mergeData?: MergeCallback<TData>,
	): void;
	track(key: TKey, data: TData, mergeData?: MergeCallback<TData>): TAnchor;
	forget(anchor: TAnchor): void;
	lookup(key: TKey): FieldAnchorSetEntry<TData, TKey, TAnchor> | undefined;
	locate(anchor: TAnchor): FieldAnchorSetEntry<TData, TKey, TAnchor>;
	getData(anchor: TAnchor): TData;
	rebase(over: TaggedChange<TChangeset>, direction: RebaseDirection): void;
	entries(): IterableIterator<FieldAnchorSetEntry<TData, TKey, TAnchor>>;
}

export interface FieldAnchorSetEntry<TData, TKey, TAnchor> {
	readonly key: TKey;
	readonly anchor: TAnchor;
	readonly data: TData;
}

export enum RebaseDirection {
	Forward,
	Backward,
}
