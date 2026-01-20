/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NormalizedFieldUpPath, NormalizedUpPath } from "../../core/index.js";

import type {
	DataEditor,
	OptionalFieldEditor,
	SequenceFieldEditor,
	RequiredFieldEditor,
} from "./defaultEditBuilder.js";

/**
 * An IDefaultEditBuilder implementation based on another IDefaultEditBuilder that uses a different content type for insertions.
 */
export class MappedEditBuilder<TBase, TAdapted, TDetachedRoot, TDetachedRoots>
	implements DataEditor<TAdapted, TDetachedRoot, TDetachedRoots>
{
	public constructor(
		private readonly baseBuilder: DataEditor<TBase, TDetachedRoot, TDetachedRoots>,
		private readonly mapDelegate: (input: TAdapted) => TBase,
	) {}

	public buildRoots(content: TAdapted): TDetachedRoots {
		return this.baseBuilder.buildRoots(this.mapDelegate(content));
	}

	public valueField(
		field: NormalizedFieldUpPath,
	): RequiredFieldEditor<TAdapted, TDetachedRoot> {
		const baseField = this.baseBuilder.valueField(field);
		return {
			set: (newContent: TAdapted): void => {
				const mappedContent = this.mapDelegate(newContent);
				baseField.set(mappedContent);
			},
			attach: (content: TDetachedRoot): void => {
				baseField.attach(content);
			},
		};
	}

	public optionalField(
		field: NormalizedFieldUpPath,
	): OptionalFieldEditor<TAdapted, TDetachedRoot> {
		const baseField = this.baseBuilder.optionalField(field);
		return {
			set: (newContent: TAdapted | undefined, wasEmpty: boolean): void => {
				const mappedContent =
					newContent === undefined ? undefined : this.mapDelegate(newContent);
				baseField.set(mappedContent, wasEmpty);
			},
			attach: (content, wasEmpty: boolean): void => {
				baseField.attach(content, wasEmpty);
			},
			clear(wasEmpty: boolean): void {
				baseField.clear(wasEmpty);
			},
		};
	}
	public sequenceField(
		field: NormalizedFieldUpPath,
	): SequenceFieldEditor<TAdapted, TDetachedRoots> {
		const baseField = this.baseBuilder.sequenceField(field);
		return {
			insert: (index: number, content: TAdapted): void => {
				const mappedContent = this.mapDelegate(content);
				baseField.insert(index, mappedContent);
			},
			remove: (index: number, count: number): void => {
				baseField.remove(index, count);
			},
			attach: (index: number, detachedContent: TDetachedRoots): void => {
				baseField.attach(index, detachedContent);
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
	public addNoChangeConstraint(): void {
		this.baseBuilder.addNoChangeConstraint();
	}
	public addNoChangeConstraintOnRevert(): void {
		this.baseBuilder.addNoChangeConstraintOnRevert();
	}
}
