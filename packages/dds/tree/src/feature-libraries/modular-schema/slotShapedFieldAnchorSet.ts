/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, Brand, JsonCompatibleReadOnly } from "../../util";
import {
	AnchorSetAspects,
	MapCallback,
	MergeCallback,
	FieldAnchorSetEntry,
	DataEncoder,
	DataDecoder,
	UpdateCallback,
} from "./anchorSetOps";

/**
 * A set of anchors for a slot-shaped field.
 */
export interface SlotFieldAnchorSet<A = unknown> {
	entry?: A;
}

/**
 * Implementation of shape-dependent {@link FieldAnchorSetOps} functions for slot-shaped fields.
 */
export const slotFieldAnchorSetOps = {
	factory: <TData>(): SlotFieldAnchorSet<TData> => ({}),
	clone,
	encode,
	decode,
	count,
	map,
	updateAll,
	mergeIn,
	track,
	forget,
	lookup,
	entries,
};

/**
 * A child key for a slot-shaped field.
 */
export type SlotKey = Brand<0, "SlotKey">;

/**
 * Helper type function to describe the concrete aspect types of a {@link FieldAnchorSetOps} implementation
 * that relies on {@link slotFieldAnchorSetOps}.
 */
export interface SlotAnchorSetTypes<A, TChange>
	extends AnchorSetAspects<SlotFieldAnchorSet<A>, SlotKey, TChange> {}

function map<A, B>(set: SlotFieldAnchorSet<A>, f: MapCallback<A, B>): SlotFieldAnchorSet<B> {
	if (set.entry !== undefined) {
		return { entry: f(set.entry) };
	}
	return {};
}

function clone<TData>(set: SlotFieldAnchorSet<TData>): SlotFieldAnchorSet<TData> {
	if (set.entry !== undefined) {
		return { entry: set.entry };
	}
	return {};
}

function updateAll<TData>(set: SlotFieldAnchorSet<TData>, f: UpdateCallback<TData, SlotKey>): void {
	if (set.entry !== undefined) {
		set.entry = f(set.entry, brand(0));
	}
}

function count(set: SlotFieldAnchorSet): number {
	return set.entry === undefined ? 0 : 1;
}

function forget(set: SlotFieldAnchorSet, key: SlotKey): void {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	delete set.entry;
}

function track<TData>(
	set: SlotFieldAnchorSet<TData>,
	key: SlotKey,
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
	set: SlotFieldAnchorSet<TData>,
	added: SlotFieldAnchorSet<TData>,
	mergeData?: MergeCallback<TData>,
): void {
	if (added.entry !== undefined) {
		track(set, brand(0), added.entry, mergeData);
	}
}

function lookup<TData>(
	set: SlotFieldAnchorSet<TData>,
	key: SlotKey,
): FieldAnchorSetEntry<TData, SlotKey> | undefined {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	return set.entry === undefined ? undefined : { key, data: set.entry };
}

function entries<TData>(
	set: SlotFieldAnchorSet<TData>,
): IterableIterator<FieldAnchorSetEntry<TData, SlotKey>> {
	const array: FieldAnchorSetEntry<TData, SlotKey>[] = [];
	if (set.entry !== undefined) {
		array.push({ data: set.entry, key: brand(0) });
	}
	return array.values();
}

function encode<TData>(
	formatVersion: number,
	set: SlotFieldAnchorSet<TData>,
	dataEncoder: DataEncoder<TData>,
): JsonCompatibleReadOnly {
	if (set.entry === undefined) {
		return {};
	}
	return { entry: dataEncoder(set.entry) };
}

function decode<TData>(
	formatVersion: number,
	set: JsonCompatibleReadOnly,
	dataDecoder: DataDecoder<TData>,
): SlotFieldAnchorSet<TData> {
	const encodedSet = set as { entry?: JsonCompatibleReadOnly };
	if (encodedSet.entry !== undefined) {
		return { entry: dataDecoder(encodedSet.entry) };
	}
	return {};
}
