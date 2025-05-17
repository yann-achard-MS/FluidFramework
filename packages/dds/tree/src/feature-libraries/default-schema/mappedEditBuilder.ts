/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NormalizedFieldUpPath, NormalizedUpPath } from "../../core/index.js";

import type {
	IDefaultEditBuilder,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
} from "./defaultEditBuilder.js";

/**
 * An IDefaultEditBuilder implementation based on another IDefaultEditBuilder that uses a different content type for insertions.
 */
export class MappedEditBuilder<TBase, TAdapted, TDetachedRoots>
	implements IDefaultEditBuilder<TAdapted, TDetachedRoots>
{
	public constructor(
		private readonly baseBuilder: IDefaultEditBuilder<TBase, TDetachedRoots>,
		private readonly mapDelegate: (input: TAdapted) => TBase,
	) {}
	public hydrate(unhydrated: TAdapted): TDetachedRoots {
		return this.baseBuilder.hydrate(this.mapDelegate(unhydrated));
	}
	public valueField(
		field: NormalizedFieldUpPath,
	): ValueFieldEditBuilder<TAdapted, TDetachedRoots> {
		const baseField = this.baseBuilder.valueField(field);
		return {
			attach: (newContent: TDetachedRoots): void => {
				baseField.attach(newContent);
			},
			set: (newContent: TAdapted): void => {
				const mappedContent = this.mapDelegate(newContent);
				baseField.set(mappedContent);
			},
		};
	}
	public optionalField(
		field: NormalizedFieldUpPath,
	): OptionalFieldEditBuilder<TAdapted, TDetachedRoots> {
		const baseField = this.baseBuilder.optionalField(field);
		return {
			attach: (newContent: TDetachedRoots, wasEmpty: boolean): void => {
				baseField.attach(newContent, wasEmpty);
			},
			clear: (wasEmpty: boolean): void => {
				baseField.clear(wasEmpty);
			},
			set: (newContent: TAdapted | undefined, wasEmpty: boolean): void => {
				const mappedContent =
					newContent === undefined ? undefined : this.mapDelegate(newContent);
				baseField.set(mappedContent, wasEmpty);
			},
		};
	}
	public sequenceField(
		field: NormalizedFieldUpPath,
	): SequenceFieldEditBuilder<TAdapted, TDetachedRoots> {
		const baseField = this.baseBuilder.sequenceField(field);
		return {
			insert: (index: number, content: TAdapted): void => {
				const mappedContent = this.mapDelegate(content);
				baseField.insert(index, mappedContent);
			},
			attach: (index: number, content: TDetachedRoots): void => {
				baseField.attach(index, content);
			},
			remove: (index: number, count: number): void => {
				baseField.remove(index, count);
			},
		};
	}
	public move(
		sourceField: NormalizedFieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: NormalizedFieldUpPath,
		destinationIndex: number,
	): void {
		this.baseBuilder.move(sourceField, sourceIndex, count, destinationField, destinationIndex);
	}
	public addNodeExistsConstraint(path: NormalizedUpPath): void {
		this.baseBuilder.addNodeExistsConstraint(path);
	}
	public addNodeExistsConstraintOnRevert(path: NormalizedUpPath): void {
		this.baseBuilder.addNodeExistsConstraintOnRevert(path);
	}
}
