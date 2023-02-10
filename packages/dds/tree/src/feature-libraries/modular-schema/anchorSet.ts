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

// Global dictionary that maps concerns implementation URIs to their concrete type over A
interface AnchorSetImplementations<A> {}

// Set of URIs for the implementations registered in the global dictionary
export type AnchorSetURIs = keyof AnchorSetImplementations<any>;

// Retrieves the concrete AnchorSet type given its URI and its type parameter
export type AnchorSetImpl<URI extends AnchorSetURIs, TData = unknown> = URI extends AnchorSetURIs
	? AnchorSetImplementations<TData>[URI]["set"]
	: never;

// Retrieves the concrete Key type given its URI and its type parameter
export type AnchorSetKey<URI extends AnchorSetURIs, TData = unknown> = URI extends AnchorSetURIs
	? AnchorSetImplementations<TData>[URI]["key"]
	: never;

// Retrieves the concrete Changeset type given its URI and its type parameter
export type AnchorSetChange<URI extends AnchorSetURIs, TData = unknown> = URI extends AnchorSetURIs
	? AnchorSetImplementations<TData>[URI]["change"]
	: never;

// --- AnchorSet HKT

/**
 * @alpha
 */
export type DataEncoder<TData> = (data: TData) => JsonCompatibleReadOnly;

/**
 * @alpha
 */
export type DataDecoder<TData> = (data: JsonCompatibleReadOnly) => TData;

/**
 * @alpha
 */
export interface FieldAnchorSetOps<TSetURI extends AnchorSetURIs> {
	readonly opsURI: TSetURI;

	readonly encode: <TData>(
		set: AnchorSetImpl<TSetURI, TData>,
		dataEncoder: DataEncoder<TData>,
	) => JsonCompatibleReadOnly;

	readonly decode: <TData>(
		encodedSet: JsonCompatibleReadOnly,
		dataDecoder: DataDecoder<TData>,
	) => AnchorSetImpl<TSetURI, TData>;

	readonly factory: <TData>() => AnchorSetImpl<TSetURI, TData>;

	readonly clone: <TData>(set: AnchorSetImpl<TSetURI, TData>) => AnchorSetImpl<TSetURI, TData>;

	readonly map: <A, B>(
		fa: AnchorSetImpl<TSetURI, A>,
		f: MapCallback<A, B>,
	) => AnchorSetImpl<TSetURI, B>;

	readonly track: <TData>(
		set: AnchorSetImpl<TSetURI, TData>,
		key: AnchorSetKey<TSetURI, TData>,
		data: TData,
		mergeData?: MergeCallback<TData>,
	) => void;

	readonly rebase: (
		set: AnchorSetImpl<TSetURI>,
		over: TaggedChange<AnchorSetChange<TSetURI>>,
		direction: RebaseDirection,
	) => void;

	readonly forget: (set: AnchorSetImpl<TSetURI>, key: AnchorSetKey<TSetURI>) => void;

	readonly lookup: <TData>(
		set: AnchorSetImpl<TSetURI, TData>,
		key: AnchorSetKey<TSetURI>,
	) => FieldAnchorSetEntry<TData, AnchorSetKey<TSetURI>> | undefined;
}

// --- Default Implementation of ops

function defaultCloneFromMap<TSetURI extends AnchorSetURIs>(
	map: FieldAnchorSetOps<TSetURI>["map"],
) {
	return <TData>(set: AnchorSetImpl<TSetURI, TData>): AnchorSetImpl<TSetURI, TData> =>
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

interface UnaryAnchorSetTypes<A, TChange> {
	set: UnaryFieldAnchorSet<A>;
	key: UnaryKey;
	change: TChange;
}

// --- AnchorSet Unary NoRebase Impl

// URI for Unary implementation
export const UnaryNoRebaseURI = "NoRebaseUnaryAnchorSet";

const unarySetNoRebaseOps: FieldAnchorSetOps<typeof UnaryNoRebaseURI> = {
	opsURI: UnaryNoRebaseURI,
	rebase: () => {},
	...unarySetOps,
};

// Registers UnaryFieldAnchorSet as the concrete implementation of the concern AnchorSet
interface AnchorSetImplementations<A> {
	[UnaryNoRebaseURI]: UnaryAnchorSetTypes<A, 0>;
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
	set: SequenceFieldAnchorSet<TData>;
	key: SequenceKey;
	change: TChange;
}

// --- AnchorSet Sequence NoRebase Impl

// URI for SequenceAnchorSet implementation
export const SequenceNoChange = "NoRebaseSequenceAnchorSet";

// Implementation of the AnchorSet concern for SequenceFieldAnchorSet
const seqSetNoRebaseOps: FieldAnchorSetOps<typeof SequenceNoChange> = {
	opsURI: SequenceNoChange,
	rebase: () => {},
	...seqSetOps,
};

// Registers SequenceFieldAnchorSet as the concrete implementation of the concern AnchorSet
interface AnchorSetImplementations<A> {
	[SequenceNoChange]: SequenceSetTypes<A, 0>;
}

// --- Usage by MCF

function use<TSet extends AnchorSetURIs>(
	set: AnchorSetImpl<TSet, string>,
	ops: FieldAnchorSetOps<TSet>,
) {
	const s2 = ops.map(set, (s: string) => 42);
	return s2;
}

const fIn: UnaryFieldAnchorSet<string> = unarySetOps.factory<string>();
const bIn: SequenceFieldAnchorSet<string> = seqSetOps.factory<string>();
const fOut = use(fIn, unarySetNoRebaseOps);
const bOut = use(bIn, seqSetNoRebaseOps);
