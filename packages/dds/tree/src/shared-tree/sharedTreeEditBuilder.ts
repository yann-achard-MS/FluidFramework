/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CodecWriteOptions } from "../codec/index.js";
import type {
	ChangeFamily,
	ChangeFamilyEditor,
	RevisionTag,
	TaggedChange,
	TreeStoredSchema,
} from "../core/index.js";
import {
	DefaultEditBuilder,
	type IDefaultEditBuilder,
	type ModularChangeset,
	type ModularEditBuilder,
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
export interface ISharedTreeEditor extends IDefaultEditBuilder {
	/**
	 * Editor for schema changes.
	 */
	schema: ISchemaEditor;
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class SharedTreeEditBuilder
	extends DefaultEditBuilder
	implements ChangeFamilyEditor, ISharedTreeEditor
{
	public readonly schema: ISchemaEditor;

	public constructor(
		modularChangeFamily: ChangeFamily<ModularEditBuilder, ModularChangeset>,
		codecOptions: CodecWriteOptions,
		mintRevisionTag: () => RevisionTag,
		private readonly changeReceiver: (change: TaggedChange<SharedTreeChange>) => void,
	) {
		super(
			modularChangeFamily,
			mintRevisionTag,
			(taggedChange) =>
				changeReceiver({
					...taggedChange,
					change: { changes: [{ type: "data", innerChange: taggedChange.change }] },
				}),
			codecOptions,
		);

		this.schema = {
			setStoredSchema: (oldSchema, newSchema) => {
				this.changeReceiver({
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
