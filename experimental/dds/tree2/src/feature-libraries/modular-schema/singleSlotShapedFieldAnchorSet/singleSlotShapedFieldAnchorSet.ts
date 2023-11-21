/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	AnchorSetAspects,
	FieldAnchorSetEntry,
	MapCallback,
	MergeCallback,
	MutateCallback,
	UpdateCallback,
} from "../anchorSetOps";
import { makeSingleSlotShapedFieldAnchorSetCodecFamily } from "./singleSlotShapedFieldAnchorSetCodecs";
import { SingleSlotFieldAnchorSet, SingleSlotKey } from "./singleSlotShapedFieldAnchorSetTypes";

/**
 * Implementation of shape-dependent {@link FieldAnchorSetOps} functions for singleSlot-shaped fields.
 */
export const singleSlotFieldAnchorSetOps = {
	factory: <TData>(): SingleSlotFieldAnchorSet<TData> => ({}),
	clone,
	codecsFactory: makeSingleSlotShapedFieldAnchorSetCodecFamily,
	count,
	map,
	updateAll,
	mutateAll,
	mergeIn,
	track,
	forget,
	keyFromIndex,
	indexFromKey,
	lookup,
	entries,
};

/**
 * Helper type function to describe the concrete aspect types of a {@link FieldAnchorSetOps} implementation
 * that relies on {@link singleSlotFieldAnchorSetOps}.
 */
export interface SingleSlotAnchorSetTypes<TData, TChange>
	extends AnchorSetAspects<SingleSlotFieldAnchorSet<TData>, SingleSlotKey, TChange> {}

function map<A, B>(
	set: SingleSlotFieldAnchorSet<A>,
	f: MapCallback<A, B>,
): SingleSlotFieldAnchorSet<B> {
	if (set.entry !== undefined) {
		return { entry: f(set.entry) };
	}
	return {};
}

function clone<TData>(set: SingleSlotFieldAnchorSet<TData>): SingleSlotFieldAnchorSet<TData> {
	if (set.entry !== undefined) {
		return { entry: set.entry };
	}
	return {};
}

function updateAll<TData>(
	set: SingleSlotFieldAnchorSet<TData>,
	f: UpdateCallback<TData, SingleSlotKey>,
): void {
	if (set.entry !== undefined) {
		set.entry = f(set.entry, undefined);
	}
}

function mutateAll<TData>(
	set: SingleSlotFieldAnchorSet<TData>,
	f: MutateCallback<TData, SingleSlotKey>,
): void {
	if (set.entry !== undefined) {
		f(set.entry, undefined);
	}
}

function count(set: SingleSlotFieldAnchorSet): number {
	return set.entry === undefined ? 0 : 1;
}

function forget(set: SingleSlotFieldAnchorSet, key: SingleSlotKey): void {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	delete set.entry;
}

function track<TData>(
	set: SingleSlotFieldAnchorSet<TData>,
	key: SingleSlotKey,
	data: TData,
	mergeData?: MergeCallback<TData>,
): void {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	if (set.entry === undefined) {
		set.entry = data;
	} else {
		assert(mergeData !== undefined, "No data merging delegate provided");
		set.entry = mergeData(set.entry, data);
	}
}

function mergeIn<TData>(
	set: SingleSlotFieldAnchorSet<TData>,
	added: SingleSlotFieldAnchorSet<TData>,
	mergeData?: MergeCallback<TData>,
): void {
	if (added.entry !== undefined) {
		track(set, undefined, added.entry, mergeData);
	}
}

function lookup<TData>(
	set: SingleSlotFieldAnchorSet<TData>,
	key: SingleSlotKey,
): FieldAnchorSetEntry<TData, SingleSlotKey> | undefined {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	return set.entry === undefined ? undefined : { key, data: set.entry };
}

function keyFromIndex(index: number): SingleSlotKey {
	assert(index === 0, "Invalid non-zero index into single-slot field");
	return undefined;
}

function indexFromKey(key: SingleSlotKey): number {
	return 0;
}

function entries<TData>(
	set: SingleSlotFieldAnchorSet<TData>,
): IterableIterator<FieldAnchorSetEntry<TData, SingleSlotKey>> {
	const array: FieldAnchorSetEntry<TData, SingleSlotKey>[] = [];
	if (set.entry !== undefined) {
		array.push({ data: set.entry, key: undefined });
	}
	return array.values();
}
