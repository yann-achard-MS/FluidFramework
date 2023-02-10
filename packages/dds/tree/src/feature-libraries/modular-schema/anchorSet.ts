/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TaggedChange } from "../../core";
import { Brand, JsonCompatibleReadOnly, Mutable } from "../../util";

export type MergeCallback<TData> = (existingData: TData, newData: TData) => TData;
export type UpdateCallback<TData, TKey> = (data: TData, key: TKey) => TData;
export type MapCallback<TIn, TOut> = (data: TIn) => TOut;

export interface FieldAnchorSetEntry<TData, TKey> {
	readonly key: TKey;
	readonly data: TData;
}

export enum RebaseDirection {
	Forward,
	Backward,
}

/**
 * @alpha
 */
export type DataEncoder<TData> = (data: TData) => JsonCompatibleReadOnly;

/**
 * @alpha
 */
export type DataDecoder<TData> = (data: JsonCompatibleReadOnly) => TData;

/**
 * Global registry that maps implementation URIs to their concrete types.
 * @param TData - The type of data stored in individual anchors.
 *
 * @alpha
 */
interface AnchorSetOpRegistry<TData> {}

/**
 * Set of URIs for the registered concrete implementations of {@link FieldAnchorSetOps}.
 */
type AnchorSetOpsURIs = keyof AnchorSetOpRegistry<any>;

/**
 * The aspects that make up an {@link FieldAnchorSetOps} implementation.
 *
 * This interface is purely used for describing the concrete type of {@link FieldAnchorSetOps} implementations in a
 * standardized manner. No objects of this type are instantiated.
 *
 * @alpha
 */
export interface AnchorSetAspects<TShape = unknown, TKey = unknown, TChangeset = unknown> {
	shape: TShape;
	key: TKey;
	changeset: TChangeset;
}

/**
 * Retrieves the concrete type for an aspect of a {@link FieldAnchorSetOps} implementation.
 */
type AnchorSetOpsAspectImpl<
	URI extends AnchorSetOpsURIs,
	TAspect extends keyof AnchorSetAspects,
	TData = unknown,
> = URI extends AnchorSetOpsURIs ? AnchorSetOpRegistry<TData>[URI][TAspect] : never;

/**
 * Retrieves the concrete shape type of a {@link FieldAnchorSetOps} implementation.
 */
export type AnchorSetShape<URI extends AnchorSetOpsURIs, TData = unknown> = AnchorSetOpsAspectImpl<
	URI,
	"shape",
	TData
>;

/**
 * Retrieves the concrete key type of a {@link FieldAnchorSetOps} implementation.
 */
export type AnchorSetKey<URI extends AnchorSetOpsURIs, TData = unknown> = AnchorSetOpsAspectImpl<
	URI,
	"key",
	TData
>;

/**
 * Retrieves the concrete changeset type of a {@link FieldAnchorSetOps} implementation.
 */
export type AnchorSetChange<URI extends AnchorSetOpsURIs, TData = unknown> = AnchorSetOpsAspectImpl<
	URI,
	"changeset",
	TData
>;

/**
 * The set of operations required on a given field's anchor set.
 *
 * @param TOpsURI - The type of the URI of the {@link FieldAnchorSetOps} implementation.
 *
 * @alpha
 */
export interface FieldAnchorSetOps<TOpsURI extends AnchorSetOpsURIs> {
	readonly encode: <TData>(
		set: AnchorSetShape<TOpsURI, TData>,
		dataEncoder: DataEncoder<TData>,
	) => JsonCompatibleReadOnly;

	readonly decode: <TData>(
		encodedSet: JsonCompatibleReadOnly,
		dataDecoder: DataDecoder<TData>,
	) => AnchorSetShape<TOpsURI, TData>;

	readonly factory: <TData>() => AnchorSetShape<TOpsURI, TData>;

	readonly clone: <TData>(set: AnchorSetShape<TOpsURI, TData>) => AnchorSetShape<TOpsURI, TData>;

	readonly map: <TIn, TOut>(
		fa: AnchorSetShape<TOpsURI, TIn>,
		f: MapCallback<TIn, TOut>,
	) => AnchorSetShape<TOpsURI, TOut>;

	readonly track: <TData>(
		set: AnchorSetShape<TOpsURI, TData>,
		key: AnchorSetKey<TOpsURI, TData>,
		data: TData,
		mergeData?: MergeCallback<TData>,
	) => void;

	readonly rebase: (
		set: AnchorSetShape<TOpsURI>,
		over: TaggedChange<AnchorSetChange<TOpsURI>>,
		direction: RebaseDirection,
	) => void;

	readonly forget: (set: AnchorSetShape<TOpsURI>, key: AnchorSetKey<TOpsURI>) => void;

	readonly lookup: <TData>(
		set: AnchorSetShape<TOpsURI, TData>,
		key: AnchorSetKey<TOpsURI>,
	) => FieldAnchorSetEntry<TData, AnchorSetKey<TOpsURI>> | undefined;
}

// --- Default Implementations no matter the shape, key, or changeset

/**
 * @returns a implementation of {@link FieldAnchorSetOps.clone}.
 */
export function defaultCloneFromMap<TSetURI extends AnchorSetOpsURIs>(
	map: FieldAnchorSetOps<TSetURI>["map"],
) {
	return <TData>(set: AnchorSetShape<TSetURI, TData>): AnchorSetShape<TSetURI, TData> =>
		map(set, (data) => data);
}

// --- AnchorSet Unary Impl

interface UnaryFieldAnchorSet<A = unknown> {
	entry?: A;
}

function mapUnary<A, B>(
	unarySet: UnaryFieldAnchorSet<A>,
	f: MapCallback<A, B>,
): UnaryFieldAnchorSet<B> {
	if (unarySet.entry !== undefined) {
		return { entry: f(unarySet.entry) };
	}
	return {};
}

function unaryForget(set: UnaryFieldAnchorSet, key: UnaryKey): void {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	delete set.entry;
}

function unaryTrack<TData>(
	set: UnaryFieldAnchorSet<TData>,
	key: UnaryKey,
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

function unaryLookup<TData>(
	set: UnaryFieldAnchorSet<TData>,
	key: UnaryKey,
): FieldAnchorSetEntry<TData, UnaryKey> | undefined {
	assert(key === 0, "Unary field anchor set cannot track non-zero key");
	return set.entry === undefined ? undefined : { key, data: set.entry };
}

function unaryEncode<TData>(
	set: UnaryFieldAnchorSet<TData>,
	dataEncoder: DataEncoder<TData>,
): JsonCompatibleReadOnly {
	if (set.entry === undefined) {
		return {};
	}
	return { entry: dataEncoder(set.entry) };
}

function unaryDecode<TData>(
	set: JsonCompatibleReadOnly,
	dataDecoder: DataDecoder<TData>,
): UnaryFieldAnchorSet<TData> {
	const encodedSet = set as { entry?: JsonCompatibleReadOnly };
	if (encodedSet.entry !== undefined) {
		return { entry: dataDecoder(encodedSet.entry) };
	}
	return {};
}

// Implementation of the AnchorSet concern for UnaryFieldAnchorSet
const unarySetOps = {
	factory: <A>(): UnaryFieldAnchorSet<A> => ({}),
	encode: unaryEncode,
	decode: unaryDecode,
	clone: defaultCloneFromMap<typeof UnaryNoRebaseURI>(mapUnary),
	map: mapUnary,
	track: unaryTrack,
	forget: unaryForget,
	lookup: unaryLookup,
};

export type UnaryKey = Brand<0, "UnaryKey">;

interface UnaryAnchorSetTypes<A, TChange>
	extends AnchorSetAspects<UnaryFieldAnchorSet<A>, UnaryKey, TChange> {}

// --- AnchorSet Unary NoRebase Impl

// URI for Unary implementation
export const UnaryNoRebaseURI = "NoRebaseUnaryAnchorSet";

const unarySetNoRebaseOps: FieldAnchorSetOps<typeof UnaryNoRebaseURI> = {
	rebase: () => {},
	...unarySetOps,
};

// Registers UnaryFieldAnchorSet as the concrete implementation of the concern AnchorSet
interface AnchorSetOpRegistry<TData> {
	[UnaryNoRebaseURI]: UnaryAnchorSetTypes<TData, 0>;
}

// --- AnchorSet Sequence Impl

type Entry<TData> = FieldAnchorSetEntry<TData, SequenceKey>;

interface SequenceFieldAnchorSet<A = unknown> {
	list: Mutable<Entry<A>>[];
}

function mapSequenceAnchorSet<A, B>(
	barSet: SequenceFieldAnchorSet<A>,
	f: MapCallback<A, B>,
): SequenceFieldAnchorSet<B> {
	return { list: barSet.list.map(({ key, data }) => ({ key, data: f(data) })) };
}

function sequenceTrack<TData>(
	set: SequenceFieldAnchorSet<TData>,
	key: SequenceKey,
	data: TData,
	mergeData?: MergeCallback<TData>,
): void {
	sequenceAdd(set, key, data, mergeData);
}

function sequenceAdd<TData>(
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

function sequenceForget(set: SequenceFieldAnchorSet, key: SequenceKey): void {
	const index = set.list.findIndex((entry) => entry.key === key);
	assert(index !== -1, "Cannot forget unknown key");
	set.list.splice(index, 1);
}

function sequenceLookup<TData>(
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

function sequenceEncode<TData>(
	set: SequenceFieldAnchorSet<TData>,
	dataEncoder: DataEncoder<TData>,
): JsonCompatibleReadOnly {
	return {
		list: set.list.map((entry) => ({ ...entry, data: dataEncoder(entry.data) })),
	};
}

function sequenceDecode<TData>(
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

// Implementation of the AnchorSet concern for SequenceFieldAnchorSet
const seqSetOps = {
	factory: <A>(): SequenceFieldAnchorSet<A> => ({ list: [] }),
	encode: sequenceEncode,
	decode: sequenceDecode,
	clone: defaultCloneFromMap<typeof SequenceNoChange>(mapSequenceAnchorSet),
	map: mapSequenceAnchorSet,
	track: sequenceTrack,
	forget: sequenceForget,
	lookup: sequenceLookup,
};

export type SequenceKey = Brand<number, "UnaryKey">;

interface SequenceSetTypes<TData, TChange> {
	shape: SequenceFieldAnchorSet<TData>;
	key: SequenceKey;
	changeset: TChange;
}

// --- AnchorSet Sequence NoRebase Impl

// URI for SequenceAnchorSet implementation
export const SequenceNoChange = "NoRebaseSequenceAnchorSet";

// Implementation of the AnchorSet concern for SequenceFieldAnchorSet
const seqSetNoRebaseOps: FieldAnchorSetOps<typeof SequenceNoChange> = {
	rebase: () => {},
	...seqSetOps,
};

// Registers SequenceFieldAnchorSet as the concrete implementation of the concern AnchorSet
interface AnchorSetOpRegistry<TData> {
	[SequenceNoChange]: SequenceSetTypes<TData, 0>;
}

// --- Usage by MCF

function use<TSet extends AnchorSetOpsURIs>(
	set: AnchorSetShape<TSet, string>,
	ops: FieldAnchorSetOps<TSet>,
) {
	const s2 = ops.map(set, (s: string) => 42);
	return s2;
}

const fIn: UnaryFieldAnchorSet<string> = unarySetOps.factory<string>();
const bIn: SequenceFieldAnchorSet<string> = seqSetOps.factory<string>();
const fOut = use(fIn, unarySetNoRebaseOps);
const bOut = use(bIn, seqSetNoRebaseOps);
