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

/**
 * Global registry that maps implementation URIs to their concrete types.
 * @param TData - The type of data stored in individual anchors.
 */
export interface AnchorSetOpRegistry<TData> {}

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
export interface AnchorSetAspects<TShape = unknown, TKey = unknown, TChangeset = unknown> {
	container: TShape;
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
	"container",
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
