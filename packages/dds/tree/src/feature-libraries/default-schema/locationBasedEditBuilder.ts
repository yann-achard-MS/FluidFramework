/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	FieldKey,
	NormalizedFieldUpPath,
	NormalizedUpPath,
	TreeChunk,
} from "../../core/index.js";

import type {
	DetachedRootIds,
	DataEditor,
	OptionalFieldEditor,
	RequiredFieldEditor,
	SequenceFieldEditor,
} from "./defaultEditBuilder.js";

export type DetachedRootLocation = FieldKey;
export type DetachedRootsLocation = readonly DetachedRootRangeLocation[];
export interface DetachedRootRangeLocation {
	readonly field: FieldKey;
	readonly count: number;
}

export interface Locator {
	locationFromId(id: ChangeAtomId): DetachedRootLocation;
	idFromLocation(id: DetachedRootLocation): ChangeAtomId;
	locationsFromIdRanges(id: DetachedRootIds): DetachedRootsLocation;
	idRangesFromLocations(id: DetachedRootsLocation): DetachedRootIds;
}

export type ILocationBasedDataEditor = DataEditor<
	TreeChunk,
	DetachedRootLocation,
	DetachedRootsLocation
>;

/**
 * Implementation of {@link DataEditor} based on the default set of supported field kinds.
 * @sealed
 */
export class LocationBasedDataEditor
	implements DataEditor<TreeChunk, DetachedRootLocation, DetachedRootsLocation>
{
	public constructor(
		private readonly idBasedEditor: DataEditor<TreeChunk, ChangeAtomId, DetachedRootIds>,
		private readonly locator: Locator,
	) {}

	public addNodeExistsConstraint(path: NormalizedUpPath): void {
		this.idBasedEditor.addNodeExistsConstraint(path);
	}

	public addNodeExistsConstraintOnRevert(path: NormalizedUpPath): void {
		this.idBasedEditor.addNodeExistsConstraintOnRevert(path);
	}

	public buildRoots(content: TreeChunk): DetachedRootsLocation {
		const roots = this.idBasedEditor.buildRoots(content);
		const locations = this.locator.locationsFromIdRanges(roots);
		return locations;
	}

	public valueField(
		field: NormalizedFieldUpPath,
	): RequiredFieldEditor<TreeChunk, DetachedRootLocation> {
		const lowLevelEditor = this.idBasedEditor.valueField(field);
		const locator = this.locator;
		const editBuilder = {
			set: (newContent: TreeChunk): void => {
				lowLevelEditor.set(newContent);
			},
			attach: (newContent: DetachedRootLocation): void => {
				const changeAtom = locator.idFromLocation(newContent);
				lowLevelEditor.attach(changeAtom);
			},
		};
		return editBuilder;
	}

	public optionalField(
		field: NormalizedFieldUpPath,
	): OptionalFieldEditor<TreeChunk, DetachedRootLocation> {
		const lowLevelEditor = this.idBasedEditor.optionalField(field);
		const locator = this.locator;
		const editBuilder = {
			set: (newContent: TreeChunk | undefined, wasEmpty: boolean): void => {
				lowLevelEditor.set(newContent, wasEmpty);
			},
			attach: (newContent: DetachedRootLocation | undefined, wasEmpty: boolean): void => {
				if (newContent === undefined) {
					editBuilder.clear(wasEmpty);
					return;
				}
				const changeAtom = locator.idFromLocation(newContent);
				lowLevelEditor.attach(changeAtom, wasEmpty);
			},
			clear: (wasEmpty: boolean): void => {
				lowLevelEditor.clear(wasEmpty);
			},
		};
		return editBuilder;
	}

	public move(
		sourceField: NormalizedFieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: NormalizedFieldUpPath,
		destIndex: number,
	): void {
		this.idBasedEditor.move(sourceField, sourceIndex, count, destinationField, destIndex);
	}

	public sequenceField(
		field: NormalizedFieldUpPath,
	): SequenceFieldEditor<TreeChunk, DetachedRootsLocation> {
		const lowLevelEditor = this.idBasedEditor.sequenceField(field);
		const locator = this.locator;
		const editBuilder = {
			insert: (index: number, content: TreeChunk): void => {
				lowLevelEditor.insert(index, content);
			},
			attach: (index: number, newContent: DetachedRootsLocation): void => {
				const range = locator.idRangesFromLocations(newContent);
				lowLevelEditor.attach(index, range);
			},
			remove: (index: number, count: number): void => {
				lowLevelEditor.remove(index, count);
			},
		};
		return editBuilder;
	}
}
