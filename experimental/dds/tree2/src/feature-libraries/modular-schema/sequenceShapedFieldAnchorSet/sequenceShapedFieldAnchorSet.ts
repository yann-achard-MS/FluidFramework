/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Mutable } from "../../../util";
import {
	AnchorSetAspects,
	FieldAnchorSetEntry,
	MapCallback,
	MergeCallback,
	UpdateCallback,
} from "../anchorSetOps";
import { makeSequenceShapedFieldAnchorSetCodecFamily } from "./sequenceShapedFieldAnchorSetCodecs";
import { SequenceKey } from "./sequenceShapedFieldAnchorSetTypes";

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
	clone,
	codecsFactory: makeSequenceShapedFieldAnchorSetCodecFamily,
	count,
	map,
	updateAll,
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
 * that relies on {@link sequenceFieldAnchorSetOps}.
 */
export interface SequenceAnchorSetTypes<TData, TChange>
	extends AnchorSetAspects<SequenceFieldAnchorSet<TData>, SequenceKey, TChange> {}

function map<TIn, TOut>(
	set: SequenceFieldAnchorSet<TIn>,
	f: MapCallback<TIn, TOut>,
): SequenceFieldAnchorSet<TOut> {
	return { list: set.list.map(({ key, data }) => ({ key, data: f(data) })) };
}

function clone<TData>(set: SequenceFieldAnchorSet<TData>): SequenceFieldAnchorSet<TData> {
	return { list: set.list.map((entry) => ({ ...entry })) };
}

function updateAll<TData>(
	set: SequenceFieldAnchorSet<TData>,
	f: UpdateCallback<TData, SequenceKey>,
): void {
	for (const entry of set.list) {
		entry.data = f(entry.data, entry.key);
	}
}

function count(set: SequenceFieldAnchorSet): number {
	return set.list.length;
}

function track<TData>(
	set: SequenceFieldAnchorSet<TData>,
	key: SequenceKey,
	data: TData,
	mergeData?: MergeCallback<TData>,
): void {
	add(set, key, data, mergeData);
}

function mergeIn<TData>(
	set: SequenceFieldAnchorSet<TData>,
	added: SequenceFieldAnchorSet<TData>,
	mergeData?: MergeCallback<TData>,
): void {
	let index = 0;
	for (const { key, data } of added.list) {
		index = add(set, key, data, mergeData, index);
	}
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

function keyFromIndex(index: number): SequenceKey {
	return index;
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

function entries<TData>(
	set: SequenceFieldAnchorSet<TData>,
): IterableIterator<FieldAnchorSetEntry<TData, SequenceKey>> {
	return set.list.values();
}

function indexFromKey(key: SequenceKey): number {
	return key;
}
