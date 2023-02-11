/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Brand, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	AnchorSetAspects,
	DataDecoder,
	DataEncoder,
	FieldAnchorSetEntry,
	MapCallback,
	MergeCallback,
} from "./anchorSet";

/**
 * An entry in an anchor set for a sequence-shaped field.
 */
export type Entry<TData> = FieldAnchorSetEntry<TData, SequenceKey>;

/**
 * A set of anchors for a sequence-shaped field.
 */
export interface SequenceFieldAnchorSet<A = unknown> {
	list: Mutable<Entry<A>>[];
}

/**
 * Implementation of shape-dependent {@link FieldAnchorSetOps} functions for sequence-shaped fields.
 */
export const sequenceFieldAnchorSetOps = {
	factory: <TData>(): SequenceFieldAnchorSet<TData> => ({ list: [] }),
	encode,
	decode,
	map,
	track,
	forget,
	lookup,
};

/**
 * A child key for a sequence-shaped field.
 */
export type SequenceKey = Brand<number, "UnaryKey">;

/**
 * Helper type function to describe the concrete aspect types of a {@link FieldAnchorSetOps} implementation
 * that relies on {@link sequenceFieldAnchorSetOps}.
 */
export interface SequenceSetTypes<TData, TChange>
	extends AnchorSetAspects<SequenceFieldAnchorSet<TData>, SequenceKey, TChange> {}

function map<TIn, TOut>(
	barSet: SequenceFieldAnchorSet<TIn>,
	f: MapCallback<TIn, TOut>,
): SequenceFieldAnchorSet<TOut> {
	return { list: barSet.list.map(({ key, data }) => ({ key, data: f(data) })) };
}

function track<TData>(
	set: SequenceFieldAnchorSet<TData>,
	key: SequenceKey,
	data: TData,
	mergeData?: MergeCallback<TData>,
): void {
	add(set, key, data, mergeData);
}

function add<TData>(
	set: SequenceFieldAnchorSet<TData>,
	key: SequenceKey,
	data: TData,
	mergeData?: MergeCallback<TData>,
	minIndex: number = 0,
): number {
	const index = findIndexForKey(set, key, minIndex);
	const match = set.list[index];
	if (match === undefined || match.key > key) {
		set.list.splice(index, 0, { key, data });
	} else {
		assert(mergeData !== undefined, "No data merging delegate provided");
		match.data = mergeData(match.data, data);
	}
	return index;
}

function findIndexForKey(
	set: SequenceFieldAnchorSet,
	key: SequenceKey,
	minIndex: number = 0,
): number {
	let index = minIndex;
	while (index < set.list.length && set.list[index].key < key) {
		index += 1;
	}
	return index;
}

function forget(set: SequenceFieldAnchorSet, key: SequenceKey): void {
	const index = set.list.findIndex((entry) => entry.key === key);
	assert(index !== -1, "Cannot forget unknown key");
	set.list.splice(index, 1);
}

function lookup<TData>(
	set: SequenceFieldAnchorSet<TData>,
	key: SequenceKey,
): FieldAnchorSetEntry<TData, SequenceKey> | undefined {
	const index = findIndexForKey(set, key);
	const entry: Entry<TData> | undefined = set.list[index];
	if (entry === undefined || entry.key !== key) {
		return undefined;
	}
	return entry;
}

function encode<TData>(
	set: SequenceFieldAnchorSet<TData>,
	dataEncoder: DataEncoder<TData>,
): JsonCompatibleReadOnly {
	return {
		list: set.list.map((entry) => ({ ...entry, data: dataEncoder(entry.data) })),
	};
}

function decode<TData>(
	set: JsonCompatibleReadOnly,
	dataDecoder: DataDecoder<TData>,
): SequenceFieldAnchorSet<TData> {
	const encodedSet = set as unknown as {
		readonly list: readonly Entry<JsonCompatibleReadOnly>[];
	};
	const list: Mutable<Entry<TData>>[] = encodedSet.list.map((entry) => ({
		...entry,
		data: dataDecoder(entry.data),
	}));
	return { list };
}
