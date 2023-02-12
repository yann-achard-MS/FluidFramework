/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TaggedChange } from "../../core";
import { JsonCompatibleReadOnly } from "../../util";

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

export type DataEncoder<TData> = (data: TData) => JsonCompatibleReadOnly;
export type DataDecoder<TData> = (data: JsonCompatibleReadOnly) => TData;

export const UnknownAnchorSetOps = "UnknownAnchorSetOps";
export type UnknownAnchorSetOps = typeof UnknownAnchorSetOps;

/**
 * Global registry that maps implementation URIs to their concrete types.
 * @param TData - The type of data stored in individual anchors.
 */
export interface AnchorSetOpRegistry<TData> {
	[UnknownAnchorSetOps]: AnchorSetAspects;
}

/**
 * Set of URIs for the registered concrete implementations of {@link FieldAnchorSetOps}.
 */
export type AnchorSetOpsURIs = keyof AnchorSetOpRegistry<any>;

/**
 * The aspects that make up an {@link FieldAnchorSetOps} implementation.
 *
 * This interface is purely used for describing the concrete type of {@link FieldAnchorSetOps} implementations in a
 * standardized manner. No objects of this type are instantiated.
 */
export interface AnchorSetAspects<TContainer = unknown, TKey = unknown, TChangeset = unknown> {
	container: TContainer;
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
 * Retrieves the concrete container type of a {@link FieldAnchorSetOps} implementation.
 */
export type AnchorSetContainer<
	URI extends AnchorSetOpsURIs,
	TData = unknown,
> = AnchorSetOpsAspectImpl<URI, "container", TData>;

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
 */
export interface FieldAnchorSetOps<TOpsURI extends AnchorSetOpsURIs> {
	// readonly URI: TOpsURI;

	readonly encode: <TData>(
		formatVersion: number,
		set: AnchorSetContainer<TOpsURI, TData>,
		dataEncoder: DataEncoder<TData>,
	) => JsonCompatibleReadOnly;

	readonly decode: <TData>(
		formatVersion: number,
		encodedSet: JsonCompatibleReadOnly,
		dataDecoder: DataDecoder<TData>,
	) => AnchorSetContainer<TOpsURI, TData>;

	readonly factory: <TData>() => AnchorSetContainer<TOpsURI, TData>;

	readonly count: (set: AnchorSetContainer<TOpsURI>) => number;

	readonly clone: <TData>(
		set: AnchorSetContainer<TOpsURI, TData>,
	) => AnchorSetContainer<TOpsURI, TData>;

	readonly map: <TIn, TOut>(
		fa: AnchorSetContainer<TOpsURI, TIn>,
		f: MapCallback<TIn, TOut>,
	) => AnchorSetContainer<TOpsURI, TOut>;

	readonly updateAll: <TData>(
		fa: AnchorSetContainer<TOpsURI, TData>,
		f: UpdateCallback<TData, AnchorSetKey<TOpsURI>>,
	) => void;

	readonly track: <TData>(
		set: AnchorSetContainer<TOpsURI, TData>,
		key: AnchorSetKey<TOpsURI, TData>,
		data: TData,
		mergeData?: MergeCallback<TData>,
	) => void;

	readonly mergeIn: <TData>(
		set: AnchorSetContainer<TOpsURI, TData>,
		added: AnchorSetContainer<TOpsURI, TData>,
		mergeData?: MergeCallback<TData>,
	) => void;

	readonly rebase: (
		set: AnchorSetContainer<TOpsURI>,
		over: TaggedChange<AnchorSetChange<TOpsURI>>,
		direction: RebaseDirection,
	) => void;

	readonly forget: (set: AnchorSetContainer<TOpsURI>, key: AnchorSetKey<TOpsURI>) => void;

	readonly lookup: <TData>(
		set: AnchorSetContainer<TOpsURI, TData>,
		key: AnchorSetKey<TOpsURI>,
	) => FieldAnchorSetEntry<TData, AnchorSetKey<TOpsURI>> | undefined;

	readonly entries: <TData>(
		set: AnchorSetContainer<TOpsURI, TData>,
	) => IterableIterator<FieldAnchorSetEntry<TData, AnchorSetKey<TOpsURI>>>;
}

// --- Default Implementations no matter the shape, key, or changeset

/**
 * @returns a implementation of {@link FieldAnchorSetOps.clone}.
 */
export function defaultCloneFromMap<TSetURI extends AnchorSetOpsURIs>(
	map: FieldAnchorSetOps<TSetURI>["map"],
) {
	return <TData>(set: AnchorSetContainer<TSetURI, TData>): AnchorSetContainer<TSetURI, TData> =>
		map(set, (data) => data);
}
