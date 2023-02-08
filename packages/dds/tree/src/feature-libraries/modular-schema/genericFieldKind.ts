/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Delta, TaggedChange } from "../../core";
import { Brand, brand, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	FieldAnchorSet,
	FieldAnchorSetEntry,
	MapCallback,
	MergeCallback,
	RebaseDirection,
	UpdateCallback,
} from "./anchorSet";
import {
	FieldChangeHandler,
	NodeChangeset,
	ChildIndex,
	Context,
	DataEncoder,
	DataDecoder,
} from "./fieldChangeHandler";
import { FieldKind, Multiplicity } from "./fieldKind";

/**
 * A field-kind-agnostic change to a single node within a field.
 */
export interface GenericChange {
	/**
	 * Index within the field of the changed node.
	 */
	index: number;
	/**
	 * Change to the node.
	 */
	nodeChange: NodeChangeset;
}

/**
 * Encoded version of {@link GenericChange}
 */
export interface EncodedGenericChange {
	index: number;
	// TODO: this format needs more documentation (ideally in the form of more specific types).
	nodeChange: JsonCompatibleReadOnly;
}

/**
 * A field-agnostic set of changes to the elements of a field.
 */
export type GenericChangeset = 0;

export function baseAnchorSetEncoder(factory: <TData>() => BaseAnchorSet<TData, unknown>) {
	return {
		encodeAnchorSetForJson: <TData>(
			formatVersion: number,
			set: BaseAnchorSet<TData, unknown>,
			dataEncoder: DataEncoder<TData>,
		): JsonCompatibleReadOnly => {
			return set.encodeForJson(
				formatVersion,
				dataEncoder,
			) as unknown as JsonCompatibleReadOnly;
		},

		decodeAnchorSetJson: <TData>(
			formatVersion: number,
			encodedSet: JsonCompatibleReadOnly,
			dataDecoder: DataDecoder<TData>,
		): BaseAnchorSet<TData, unknown> => {
			const newSet = factory<TData>();
			newSet.loadJson(
				formatVersion,
				encodedSet as unknown as EncodedBaseAnchorSet,
				dataDecoder,
			);
			return newSet;
		},
	};
}

export const baseChangeHandlerKeyFunctions = {
	getKey: (index: number): BaseNodeKey => brand(index),
	keyToDeltaKey: (key: BaseNodeKey): ChildIndex | undefined => ({
		context: Context.Input,
		index: key,
	}),
};

export const genericAnchorSetFactory = <TData>(): GenericAnchorSet<TData> => {
	return new GenericAnchorSet<TData>();
};

export function noRebaseAnchorSetFactoryFactory<TChangeset>() {
	return <TData>(): BaseAnchorSet<TData, TChangeset> => {
		return genericAnchorSetFactory() as unknown as BaseAnchorSet<TData, TChangeset>;
	};
}

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericChangeset, BaseNodeKey> = {
	anchorSetFactory: genericAnchorSetFactory,
	rebaser: {
		compose: (): GenericChangeset => 0,
		invert: (): GenericChangeset => 0,
		rebase: (): GenericChangeset => 0,
	},
	encoder: {
		...baseAnchorSetEncoder(genericAnchorSetFactory),
		encodeChangeForJson: (): JsonCompatibleReadOnly => 0,
		decodeChangeJson: (): GenericChangeset => 0,
	},
	editor: {},
	...baseChangeHandlerKeyFunctions,
	intoDelta: (): Delta.MarkList => [],
};

export type BaseNodeKey = Brand<number, "BaseNodeKey">;

export type Entry<TData> = FieldAnchorSetEntry<TData, BaseNodeKey>;

export interface EncodedBaseAnchorSet {
	readonly list: readonly Entry<JsonCompatibleReadOnly>[];
}

export abstract class BaseAnchorSet<TData, TChangeset>
	implements FieldAnchorSet<BaseNodeKey, TChangeset, TData>
{
	protected readonly list: Mutable<Entry<TData>>[] = [];

	public loadJson(
		formatVersion: number,
		encodedSet: EncodedBaseAnchorSet,
		dataDecoder: DataDecoder<TData>,
	): void {
		const entries: Mutable<Entry<TData>>[] = encodedSet.list.map((entry) => ({
			...entry,
			data: dataDecoder(entry.data),
		}));
		this.list.splice(0, this.list.length, ...entries);
	}

	public encodeForJson(
		formatVersion: number,
		dataEncoder: DataEncoder<TData>,
	): EncodedBaseAnchorSet {
		return {
			list: this.list.map((entry) => ({ ...entry, data: dataEncoder(entry.data) })),
		};
	}

	public count(): number {
		return this.list.length;
	}

	public updateAll(func: UpdateCallback<TData, BaseNodeKey>): void {
		for (const entry of this.list) {
			entry.data = func(entry.data, entry.key);
		}
	}

	public map<TOut>(func: MapCallback<TData, TOut>): BaseAnchorSet<TOut, TChangeset> {
		const set = this.clone() as BaseAnchorSet<TData | TOut, TChangeset>;
		set.updateAll(func as MapCallback<TData | TOut, TOut>);
		return set as BaseAnchorSet<TOut, TChangeset>;
	}

	public mergeIn(set: BaseAnchorSet<TData, TChangeset>, mergeData?: MergeCallback<TData>): void {
		let index = 0;
		for (const { key, data } of set.list) {
			index = this.add(key, data, mergeData, index);
		}
	}

	public track(key: BaseNodeKey, data: TData, mergeData?: MergeCallback<TData>): void {
		this.add(key, data, mergeData);
	}

	private add(
		key: BaseNodeKey,
		data: TData,
		mergeData?: MergeCallback<TData>,
		minIndex: number = 0,
	): number {
		const index = this.findIndexForKey(key, minIndex);
		const match = this.list[index];
		if (match === undefined || match.key > key) {
			this.list.splice(index, 0, { key, data });
		} else {
			assert(mergeData !== undefined, "No data merging delegate provided");
			match.data = mergeData(match.data, data);
		}
		return index;
	}

	private findIndexForKey(key: BaseNodeKey, minIndex: number = 0): number {
		let index = minIndex;
		while (index < this.list.length && this.list[index].key < key) {
			index += 1;
		}
		return index;
	}

	public forget(key: BaseNodeKey): void {
		const index = this.list.findIndex((entry) => entry.key === key);
		assert(index !== -1, "Cannot forget unknown key");
		this.list.splice(index, 1);
	}

	public lookup(key: BaseNodeKey): Entry<TData> | undefined {
		const index = this.findIndexForKey(key);
		const entry: Entry<TData> | undefined = this.list[index];
		if (entry === undefined || entry.key !== key) {
			return undefined;
		}
		return entry;
	}

	public entries(): IterableIterator<Entry<TData>> {
		return this.list.values();
	}

	public abstract clone(): BaseAnchorSet<TData, TChangeset>;
	public abstract rebase(over: TaggedChange<TChangeset>, direction: RebaseDirection): void;
}

export class GenericAnchorSet<TData> extends BaseAnchorSet<TData, GenericChangeset> {
	public static fromData<TData>(
		entries: readonly { readonly key: BaseNodeKey; readonly data: TData }[],
	): GenericAnchorSet<TData> {
		const set = new GenericAnchorSet<TData>();
		for (const { key, data } of entries) {
			set.track(key, data);
		}
		return set;
	}

	public clone(): GenericAnchorSet<TData> {
		const set = new GenericAnchorSet<TData>();
		set.mergeIn(this);
		return set;
	}

	public rebase(over: TaggedChange<GenericChangeset>, direction: RebaseDirection): void {
		// Nothing to rebase over
	}
}

/**
 * {@link FieldKind} used to represent changes to elements of a field in a field-kind-agnostic format.
 */
export const genericFieldKind: FieldKind = new FieldKind(
	brand("ModularEditBuilder.Generic"),
	Multiplicity.Sequence,
	genericChangeHandler,
	(types, other) => false,
	new Set(),
);
