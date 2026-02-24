/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	ChangeFamilyEditor,
	EditorOptions,
	RevisionTag,
	TaggedChange,
	TreeChunk,
	TreeStoredSchema,
} from "../core/index.js";
import {
	DefaultIdBasedDataEditor,
	LocationBasedDataEditor,
	type DetachedRootIds,
	type DetachedRootLocation,
	type DetachedRootsLocation,
	type Locator,
	type DataEditor,
	type ModularChangeFamily,
} from "../feature-libraries/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

/**
 * Editor for schema changes.
 * The only currently supported operation is to replace the stored schema.
 */
export interface ISchemaEditor {
	/**
	 * Updates the stored schema.
	 * @param oldSchema - The schema being overwritten.
	 * @param newSchema - The new schema to apply.
	 */
	setStoredSchema(oldSchema: TreeStoredSchema, newSchema: TreeStoredSchema): void;
}

/**
 * SharedTree editor for transactional tree data and schema changes.
 */
export interface IIdBasedSharedTreeEditor
	extends DataEditor<TreeChunk, ChangeAtomId, DetachedRootIds> {
	/**
	 * Editor for schema changes.
	 */
	schema: ISchemaEditor;
}

export interface ILocationBasedSharedTreeEditor
	extends DataEditor<TreeChunk, DetachedRootLocation, DetachedRootsLocation> {
	/**
	 * Editor for schema changes.
	 */
	schema: ISchemaEditor;
}

/**
 * Implementation of {@link DataEditor} based on the default set of supported field kinds.
 * @sealed
 */
export class IdBasedSharedTreeEditBuilder
	extends DefaultIdBasedDataEditor
	implements ChangeFamilyEditor, IIdBasedSharedTreeEditor
{
	public readonly schema: ISchemaEditor;

	public constructor(
		modularChangeFamily: ModularChangeFamily,
		mintRevisionTag: () => RevisionTag,
		private readonly changeReceiver: (change: TaggedChange<SharedTreeChange>) => void,
		options?: EditorOptions,
	) {
		super(
			modularChangeFamily,
			mintRevisionTag,
			(taggedChange) =>
				changeReceiver({
					...taggedChange,
					change: { changes: [{ type: "data", innerChange: taggedChange.change }] },
				}),
			options,
			modularChangeFamily.codecOptions,
		);

		this.schema = {
			setStoredSchema: (oldSchema, newSchema) => {
				changeReceiver({
					revision: mintRevisionTag(),
					change: {
						changes: [
							{
								type: "schema",
								innerChange: {
									schema: { new: newSchema, old: oldSchema },
									isInverse: false,
								},
							},
						],
					},
				});
			},
		};
	}
}

export class LocationBasedSharedTreeEditBuilder
	extends LocationBasedDataEditor
	implements ILocationBasedSharedTreeEditor
{
	public readonly schema: ISchemaEditor;

	public constructor(
		idBasedEditor: IIdBasedSharedTreeEditor,
		locator: Locator,
		options: EditorOptions,
	) {
		super(idBasedEditor, locator, options);
		this.schema = idBasedEditor.schema;
	}
}
