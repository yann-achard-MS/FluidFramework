/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Brand, JsonCompatibleReadOnly } from "../../util";
import {
	AnchorSetAspects,
	MapCallback,
	MergeCallback,
	FieldAnchorSetEntry,
	DataEncoder,
	DataDecoder,
} from "./anchorSet";

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
	encode,
	decode,
	map,
	track,
	forget,
	lookup,
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

function map<A, B>(unarySet: SlotFieldAnchorSet<A>, f: MapCallback<A, B>): SlotFieldAnchorSet<B> {
	if (unarySet.entry !== undefined) {
		return { entry: f(unarySet.entry) };
	}
	return {};
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

function lookup<TData>(
	set: SlotFieldAnchorSet<TData>,
	key: SlotKey,
): FieldAnchorSetEntry<TData, SlotKey> | undefined {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	return set.entry === undefined ? undefined : { key, data: set.entry };
}

function encode<TData>(
	set: SlotFieldAnchorSet<TData>,
	dataEncoder: DataEncoder<TData>,
): JsonCompatibleReadOnly {
	if (set.entry === undefined) {
		return {};
	}
	return { entry: dataEncoder(set.entry) };
}

function decode<TData>(
	set: JsonCompatibleReadOnly,
	dataDecoder: DataDecoder<TData>,
): SlotFieldAnchorSet<TData> {
	const encodedSet = set as { entry?: JsonCompatibleReadOnly };
	if (encodedSet.entry !== undefined) {
		return { entry: dataDecoder(encodedSet.entry) };
	}
	return {};
}
