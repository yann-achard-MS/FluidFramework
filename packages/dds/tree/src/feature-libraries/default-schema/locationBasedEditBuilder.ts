/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	type ChangeAtomId,
	type FieldKey,
	type FieldUpPath,
	type UpPath,
	type TreeChunk,
	type NormalizedUpPath,
	type NormalizedFieldUpPath,
	rootFieldKey,
	makeDetachedNodeId,
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

	public addNodeExistsConstraint(path: UpPath): void {
		const normal = normalizeUpPath(path, this.locator);
		this.idBasedEditor.addNodeExistsConstraint(normal);
	}

	public addNodeExistsConstraintOnRevert(path: UpPath): void {
		const normal = normalizeUpPath(path, this.locator);
		this.idBasedEditor.addNodeExistsConstraintOnRevert(normal);
	}

	public addNoChangeConstraint(): void {
		this.idBasedEditor.addNoChangeConstraint();
	}

	public addNoChangeConstraintOnRevert(): void {
		this.idBasedEditor.addNoChangeConstraintOnRevert();
	}

	public buildRoots(content: TreeChunk): DetachedRootsLocation {
		const roots = this.idBasedEditor.buildRoots(content);
		const locations = this.locator.locationsFromIdRanges(roots);
		return locations;
	}

	public valueField(field: FieldUpPath): RequiredFieldEditor<TreeChunk, DetachedRootLocation> {
		const normal = normalizeFieldUpPath(field, this.locator);
		const lowLevelEditor = this.idBasedEditor.valueField(normal);
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
		field: FieldUpPath,
	): OptionalFieldEditor<TreeChunk, DetachedRootLocation> {
		const normal = normalizeFieldUpPath(field, this.locator);
		const lowLevelEditor = this.idBasedEditor.optionalField(normal);
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
		sourceField: FieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: FieldUpPath,
		destIndex: number,
	): void {
		const normalSource = normalizeFieldUpPath(sourceField, this.locator);
		const normalDestination = normalizeFieldUpPath(destinationField, this.locator);
		this.idBasedEditor.move(normalSource, sourceIndex, count, normalDestination, destIndex);
	}

	public sequenceField(
		field: FieldUpPath,
	): SequenceFieldEditor<TreeChunk, DetachedRootsLocation> {
		const normal = normalizeFieldUpPath(field, this.locator);
		const lowLevelEditor = this.idBasedEditor.sequenceField(normal);
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

function normalizeUpPath(path: UpPath, locator: Locator): NormalizedUpPath {
	if (path.parent === undefined) {
		if (path.parentField === rootFieldKey) {
			return { ...path, parent: undefined, detachedNodeId: undefined };
		} else {
			const nodeId = locator.idFromLocation(path.parentField);
			const detachedNodeId = makeDetachedNodeId(nodeId.revision, nodeId.localId);
			return { ...path, parent: undefined, detachedNodeId };
		}
	} else {
		return {
			parent: normalizeUpPath(path.parent, locator),
			parentField: path.parentField,
			parentIndex: path.parentIndex,
		};
	}
}

function normalizeFieldUpPath(path: FieldUpPath, locator: Locator): NormalizedFieldUpPath {
	if (path.parent === undefined) {
		if (path.field === rootFieldKey) {
			return { parent: undefined, field: rootFieldKey };
		} else {
			throw new UsageError(
				"Editing only allowed on the root field or on fields under nodes with TreeStatus.InDocument or TreeStatus.Removed status",
			);
		}
	} else {
		return { parent: normalizeUpPath(path.parent, locator), field: path.field };
	}
}
